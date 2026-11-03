-- Campus Facility Management System: PostgreSQL Schema & Stored Procedures for Render Deployment
-- Idempotent deployment of im101_private routines, triggers, and guards.

CREATE SCHEMA IF NOT EXISTS im101_private;

-- 1. Actor resolution within serializable transactions
CREATE OR REPLACE FUNCTION im101_private.core_actor() RETURNS TABLE(actor integer, role_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $actor$
DECLARE raw text;
BEGIN
 IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Core transaction conflict.'; END IF;
 raw:=current_setting('im101.actor_id',true);
 IF raw IS NULL OR length(raw) NOT BETWEEN 1 AND 10 OR raw !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION USING ERRCODE='C4011',MESSAGE='Actor required.'; END IF;
 IF raw::bigint>2147483647 THEN RAISE EXCEPTION USING ERRCODE='C4011',MESSAGE='Actor required.'; END IF;
 RETURN QUERY SELECT u.user_id,r.role_name::text FROM public.users u JOIN public.roles r ON r.role_id=u.role_id WHERE u.user_id=raw::integer AND u.is_active FOR SHARE OF u,r;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='C4011',MESSAGE='Actor required.'; END IF;
END $actor$;

-- 2. Staff eligibility check
CREATE OR REPLACE FUNCTION im101_private.core_staff(p_staff integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $staff$
BEGIN
 PERFORM u.user_id FROM public.users u JOIN public.roles r ON r.role_id=u.role_id WHERE u.user_id=p_staff AND u.is_active AND r.role_name='Facility/Maintenance Staff' FOR SHARE OF u,r;
 RETURN FOUND;
END $staff$;

-- 3. Procedure: create_reservation
CREATE OR REPLACE PROCEDURE im101_private.create_reservation(
  IN p_facility_id integer, IN p_purpose text, IN p_start timestamptz, IN p_end timestamptz,
  INOUT p_reservation_id integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC'
AS $create$
DECLARE actor_text text; actor integer; actor_role text; facility_status text;
  pending integer; approved integer; lookup_count integer; checked_at timestamptz;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4091', MESSAGE = 'Reservation transaction conflict.';
  END IF;
  actor_text := pg_catalog.current_setting('im101.actor_id', true);
  IF actor_text IS NULL OR length(actor_text) NOT BETWEEN 1 AND 10 OR actor_text !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_text::bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  actor := actor_text::integer;
  SELECT r.role_name INTO actor_role FROM public.users u JOIN public.roles r ON r.role_id=u.role_id
    WHERE u.user_id=actor AND u.is_active FOR SHARE OF u,r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_role NOT IN ('System Administrator','Facility/Maintenance Staff','Faculty / Student Organization Representative') THEN
    RAISE EXCEPTION USING ERRCODE = 'R4031', MESSAGE = 'Reservation access denied.';
  END IF;
  IF p_reservation_id IS NOT NULL OR p_facility_id IS NULL OR p_facility_id < 1 OR p_purpose IS NULL
    OR p_purpose <> btrim(p_purpose) OR char_length(p_purpose) NOT BETWEEN 1 AND 255
    OR p_purpose ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4001', MESSAGE = 'Invalid reservation input.';
  END IF;
  PERFORM status_id FROM public.reservation_status
    WHERE status_name IN ('Pending','Approved','Rejected','Cancelled') ORDER BY status_id FOR SHARE;
  GET DIAGNOSTICS lookup_count = ROW_COUNT;
  IF lookup_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'R5031', MESSAGE = 'Reservation configuration unavailable.';
  END IF;
  SELECT status_id INTO pending FROM public.reservation_status WHERE status_name='Pending';
  SELECT status_id INTO approved FROM public.reservation_status WHERE status_name='Approved';
  SELECT status INTO facility_status FROM public.facilities WHERE facility_id=p_facility_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'R4041', MESSAGE = 'Reservation resource not found.';
  END IF;
  IF facility_status <> 'Available' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4091', MESSAGE = 'Reservation facility unavailable.';
  END IF;
  checked_at := pg_catalog.clock_timestamp();
  IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end)
    OR date_trunc('milliseconds',p_start) <> p_start OR date_trunc('milliseconds',p_end) <> p_end
    OR p_start <= checked_at OR p_end <= p_start OR p_end-p_start > interval '8 hours'
    OR p_start > checked_at+interval '90 days' OR p_end > checked_at+interval '90 days' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4001', MESSAGE = 'Invalid reservation time interval.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservations WHERE facility_id=p_facility_id AND status_id=approved
    AND start_datetime<p_end AND end_datetime>p_start) THEN
    RAISE EXCEPTION USING ERRCODE = 'R4091', MESSAGE = 'Reservation schedule conflict.';
  END IF;
  INSERT INTO public.reservations(facility_id,requested_by,approved_by,status_id,purpose,start_datetime,end_datetime)
    VALUES(p_facility_id,actor,NULL,pending,p_purpose,p_start,p_end) RETURNING reservation_id INTO p_reservation_id;
END
$create$;

-- 4. Procedure: approve_reservation
CREATE OR REPLACE PROCEDURE im101_private.approve_reservation(IN p_id integer, INOUT p_result_id integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC'
AS $approve$
DECLARE actor_text text; actor integer; actor_role text; facility integer; facility_status text;
  pending integer; approved integer; lookup_count integer; checked_at timestamptz; booking public.reservations%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4091', MESSAGE = 'Reservation transaction conflict.';
  END IF;
  actor_text := pg_catalog.current_setting('im101.actor_id', true);
  IF actor_text IS NULL OR length(actor_text) NOT BETWEEN 1 AND 10 OR actor_text !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_text::bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  actor := actor_text::integer;
  SELECT r.role_name INTO actor_role FROM public.users u JOIN public.roles r ON r.role_id=u.role_id
    WHERE u.user_id=actor AND u.is_active FOR SHARE OF u,r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_role <> 'System Administrator' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4031', MESSAGE = 'Reservation access denied.';
  END IF;
  IF p_id IS NULL OR p_id<1 OR p_result_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='R4001', MESSAGE='Invalid reservation input.';
  END IF;
  PERFORM status_id FROM public.reservation_status
    WHERE status_name IN ('Pending','Approved','Rejected','Cancelled') ORDER BY status_id FOR SHARE;
  GET DIAGNOSTICS lookup_count = ROW_COUNT;
  IF lookup_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'R5031', MESSAGE = 'Reservation configuration unavailable.';
  END IF;
  SELECT status_id INTO pending FROM public.reservation_status WHERE status_name='Pending';
  SELECT status_id INTO approved FROM public.reservation_status WHERE status_name='Approved';
  SELECT facility_id INTO facility FROM public.reservations WHERE reservation_id=p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='R4041', MESSAGE='Reservation resource not found.';
  END IF;
  SELECT status INTO facility_status FROM public.facilities WHERE facility_id=facility FOR UPDATE;
  SELECT * INTO booking FROM public.reservations WHERE reservation_id=p_id FOR UPDATE;
  IF NOT FOUND OR booking.facility_id<>facility THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation transaction conflict.';
  END IF;
  IF booking.requested_by=actor THEN
    RAISE EXCEPTION USING ERRCODE='R4031', MESSAGE='Reservation access denied.';
  END IF;
  IF booking.status_id<>pending OR facility_status<>'Available' THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation transition conflict.';
  END IF;
  checked_at := pg_catalog.clock_timestamp();
  IF booking.start_datetime IS NULL OR booking.end_datetime IS NULL OR NOT isfinite(booking.start_datetime) OR NOT isfinite(booking.end_datetime)
    OR date_trunc('milliseconds',booking.start_datetime) <> booking.start_datetime OR date_trunc('milliseconds',booking.end_datetime) <> booking.end_datetime
    OR booking.start_datetime <= checked_at OR booking.end_datetime <= booking.start_datetime OR booking.end_datetime-booking.start_datetime > interval '8 hours'
    OR booking.start_datetime > checked_at+interval '90 days' OR booking.end_datetime > checked_at+interval '90 days' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4001', MESSAGE = 'Invalid reservation time interval.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.reservations WHERE facility_id=facility AND status_id=approved
    AND reservation_id<>p_id AND start_datetime<booking.end_datetime AND end_datetime>booking.start_datetime) THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation schedule conflict.';
  END IF;
  UPDATE public.reservations SET status_id=approved,approved_by=actor WHERE reservation_id=p_id
    RETURNING reservation_id INTO p_result_id;
END
$approve$;

-- 5. Procedure: reject_reservation
CREATE OR REPLACE PROCEDURE im101_private.reject_reservation(IN p_id integer, INOUT p_result_id integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC'
AS $reject$
DECLARE actor_text text; actor integer; actor_role text; facility integer; facility_status text;
  pending integer; rejected integer; lookup_count integer; checked_at timestamptz; booking public.reservations%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4091', MESSAGE = 'Reservation transaction conflict.';
  END IF;
  actor_text := pg_catalog.current_setting('im101.actor_id', true);
  IF actor_text IS NULL OR length(actor_text) NOT BETWEEN 1 AND 10 OR actor_text !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_text::bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  actor := actor_text::integer;
  SELECT r.role_name INTO actor_role FROM public.users u JOIN public.roles r ON r.role_id=u.role_id
    WHERE u.user_id=actor AND u.is_active FOR SHARE OF u,r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_role <> 'System Administrator' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4031', MESSAGE = 'Reservation access denied.';
  END IF;
  IF p_id IS NULL OR p_id<1 OR p_result_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='R4001', MESSAGE='Invalid reservation input.';
  END IF;
  PERFORM status_id FROM public.reservation_status
    WHERE status_name IN ('Pending','Approved','Rejected','Cancelled') ORDER BY status_id FOR SHARE;
  GET DIAGNOSTICS lookup_count = ROW_COUNT;
  IF lookup_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'R5031', MESSAGE = 'Reservation configuration unavailable.';
  END IF;
  SELECT status_id INTO pending FROM public.reservation_status WHERE status_name='Pending';
  SELECT status_id INTO rejected FROM public.reservation_status WHERE status_name='Rejected';
  SELECT facility_id INTO facility FROM public.reservations WHERE reservation_id=p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='R4041', MESSAGE='Reservation resource not found.';
  END IF;
  SELECT status INTO facility_status FROM public.facilities WHERE facility_id=facility FOR UPDATE;
  SELECT * INTO booking FROM public.reservations WHERE reservation_id=p_id FOR UPDATE;
  IF NOT FOUND OR booking.facility_id<>facility THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation transaction conflict.';
  END IF;
  IF booking.requested_by=actor THEN
    RAISE EXCEPTION USING ERRCODE='R4031', MESSAGE='Reservation access denied.';
  END IF;
  IF booking.status_id<>pending THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation transition conflict.';
  END IF;
  UPDATE public.reservations SET status_id=rejected,approved_by=NULL WHERE reservation_id=p_id
    RETURNING reservation_id INTO p_result_id;
END
$reject$;

-- 6. Procedure: cancel_reservation
CREATE OR REPLACE PROCEDURE im101_private.cancel_reservation(IN p_id integer, INOUT p_result_id integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC'
AS $cancel$
DECLARE actor_text text; actor integer; actor_role text; facility integer; facility_status text;
  pending integer; approved integer; cancelled integer; lookup_count integer; checked_at timestamptz; booking public.reservations%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4091', MESSAGE = 'Reservation transaction conflict.';
  END IF;
  actor_text := pg_catalog.current_setting('im101.actor_id', true);
  IF actor_text IS NULL OR length(actor_text) NOT BETWEEN 1 AND 10 OR actor_text !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_text::bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  actor := actor_text::integer;
  SELECT r.role_name INTO actor_role FROM public.users u JOIN public.roles r ON r.role_id=u.role_id
    WHERE u.user_id=actor AND u.is_active FOR SHARE OF u,r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_role NOT IN ('System Administrator','Facility/Maintenance Staff','Faculty / Student Organization Representative') THEN
    RAISE EXCEPTION USING ERRCODE = 'R4031', MESSAGE = 'Reservation access denied.';
  END IF;
  IF p_id IS NULL OR p_id<1 OR p_result_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='R4001', MESSAGE='Invalid reservation input.';
  END IF;
  PERFORM status_id FROM public.reservation_status
    WHERE status_name IN ('Pending','Approved','Rejected','Cancelled') ORDER BY status_id FOR SHARE;
  GET DIAGNOSTICS lookup_count = ROW_COUNT;
  IF lookup_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'R5031', MESSAGE = 'Reservation configuration unavailable.';
  END IF;
  SELECT status_id INTO pending FROM public.reservation_status WHERE status_name='Pending';
  SELECT status_id INTO approved FROM public.reservation_status WHERE status_name='Approved';
  SELECT status_id INTO cancelled FROM public.reservation_status WHERE status_name='Cancelled';
  SELECT facility_id INTO facility FROM public.reservations WHERE reservation_id=p_id AND (requested_by=actor OR actor_role='System Administrator');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='R4041', MESSAGE='Reservation resource not found.';
  END IF;
  SELECT status INTO facility_status FROM public.facilities WHERE facility_id=facility FOR UPDATE;
  SELECT * INTO booking FROM public.reservations WHERE reservation_id=p_id AND (requested_by=actor OR actor_role='System Administrator') FOR UPDATE;
  IF NOT FOUND OR booking.facility_id<>facility THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation transaction conflict.';
  END IF;
  IF booking.status_id NOT IN (pending,approved) OR booking.start_datetime <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Reservation transition conflict.';
  END IF;
  UPDATE public.reservations SET status_id=cancelled WHERE reservation_id=p_id
    RETURNING reservation_id INTO p_result_id;
END
$cancel$;

-- 7. Audit trigger for reservations
CREATE OR REPLACE FUNCTION im101_private.audit_reservation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $audit$
DECLARE actor_text text; actor integer; before_value jsonb; after_value jsonb;
BEGIN
  IF TG_RELID <> 'public.reservations'::regclass OR TG_LEVEL <> 'ROW' OR TG_WHEN <> 'AFTER'
    OR TG_OP NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    RAISE EXCEPTION USING ERRCODE = 'R4031', MESSAGE = 'Reservation audit refused.';
  END IF;
  actor_text := pg_catalog.current_setting('im101.actor_id', true);
  IF actor_text IS NULL OR length(actor_text) NOT BETWEEN 1 AND 10 OR actor_text !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF actor_text::bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  actor := actor_text::integer;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = actor AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE = 'R4011', MESSAGE = 'Reservation actor context required.';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    before_value := jsonb_build_object(
      'reservation_id', OLD.reservation_id, 'facility_id', OLD.facility_id,
      'requested_by', OLD.requested_by, 'approved_by', OLD.approved_by,
      'status_id', OLD.status_id, 'purpose', OLD.purpose,
      'start_datetime', OLD.start_datetime, 'end_datetime', OLD.end_datetime,
      'created_at', OLD.created_at
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    after_value := jsonb_build_object(
      'reservation_id', NEW.reservation_id, 'facility_id', NEW.facility_id,
      'requested_by', NEW.requested_by, 'approved_by', NEW.approved_by,
      'status_id', NEW.status_id, 'purpose', NEW.purpose,
      'start_datetime', NEW.start_datetime, 'end_datetime', NEW.end_datetime,
      'created_at', NEW.created_at
    );
  END IF;
  INSERT INTO public.audit_logs(table_name, record_id, action_type, changed_by, old_value, new_value)
  VALUES ('reservations', COALESCE(NEW.reservation_id, OLD.reservation_id), TG_OP, actor, before_value, after_value);
  RETURN NULL;
END
$audit$;

DROP TRIGGER IF EXISTS reservation_audit ON public.reservations;
CREATE TRIGGER reservation_audit AFTER INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION im101_private.audit_reservation();

-- 8. Facility reservation guard trigger
CREATE OR REPLACE FUNCTION im101_private.guard_facility_reservations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $guard$
DECLARE approved integer; lookup_count integer;
BEGIN
  IF TG_RELID <> 'public.facilities'::regclass OR TG_OP <> 'UPDATE' OR TG_LEVEL <> 'ROW' OR TG_WHEN <> 'BEFORE' THEN
    RAISE EXCEPTION USING ERRCODE='R4031', MESSAGE='Facility operation refused.';
  END IF;
  IF NEW.status='Available' THEN RETURN NEW; END IF;
  IF pg_catalog.current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Facility transaction conflict.';
  END IF;
  PERFORM status_id FROM public.reservation_status
    WHERE status_name IN ('Pending','Approved','Rejected','Cancelled') ORDER BY status_id FOR SHARE;
  GET DIAGNOSTICS lookup_count = ROW_COUNT;
  IF lookup_count<>4 THEN
    RAISE EXCEPTION USING ERRCODE='R5031', MESSAGE='Reservation configuration unavailable.';
  END IF;
  SELECT status_id INTO approved FROM public.reservation_status WHERE status_name='Approved';
  IF EXISTS (SELECT 1 FROM public.reservations WHERE facility_id=OLD.facility_id AND status_id=approved
    AND end_datetime>pg_catalog.clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='R4091', MESSAGE='Facility has active or future approved reservations.';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS facility_reservation_guard ON public.facilities;
CREATE TRIGGER facility_reservation_guard BEFORE UPDATE OF status ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION im101_private.guard_facility_reservations();

-- 9. Loan workflow trigger
CREATE OR REPLACE FUNCTION im101_private.loan_workflow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $loan$
DECLARE who record; item record; n integer:=0;
BEGIN
 IF TG_RELID<>'public.equipment_loans'::regclass OR TG_WHEN<>'BEFORE' THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Loan operation refused.'; END IF;
 SELECT * INTO who FROM im101_private.core_actor();
 IF who.role_name NOT IN('System Administrator','Facility/Maintenance Staff','Faculty / Student Organization Representative') THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Access denied.'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.user_id<>who.actor OR NEW.loan_status<>'Pending' OR NEW.approved_by IS NOT NULL OR NEW.return_date IS NOT NULL OR NEW.due_date IS NULL OR NOT isfinite(NEW.due_date) OR NEW.due_date<=clock_timestamp() OR NEW.due_date>clock_timestamp()+interval '90 days' THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid loan input.'; END IF;
  NEW.requested_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF TG_OP<>'UPDATE' OR NEW.loan_id<>OLD.loan_id OR NEW.user_id<>OLD.user_id OR NEW.due_date<>OLD.due_date OR NEW.requested_at<>OLD.requested_at OR NEW.return_date IS DISTINCT FROM OLD.return_date THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Loan history is immutable.'; END IF;
 IF who.role_name NOT IN('System Administrator','Facility/Maintenance Staff') OR OLD.user_id=who.actor THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Access denied.'; END IF;
 IF NOT ((OLD.loan_status='Pending' AND NEW.loan_status IN('Approved','Rejected')) OR (OLD.loan_status='Approved' AND NEW.loan_status='Returned')) THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Loan transition conflict.'; END IF;
 IF NEW.loan_status='Rejected' THEN NEW.approved_by:=NULL;RETURN NEW; END IF;
 IF NEW.loan_status='Approved' THEN
  IF NEW.due_date<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Loan is overdue.'; END IF;
  NEW.approved_by:=who.actor;
 ELSE
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Loan history is immutable.'; END IF;
  NEW.return_date:=clock_timestamp();
 END IF;
 FOR item IN SELECT li.*,e.total_quantity,e.available_quantity,e.condition_status FROM public.loan_items li JOIN public.equipment e USING(equipment_id) WHERE li.loan_id=OLD.loan_id ORDER BY e.equipment_id FOR UPDATE OF e LOOP
  n:=n+1;
  IF item.quantity<1 OR item.available_quantity<0 OR item.available_quantity>item.total_quantity THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Inventory requires reconciliation.'; END IF;
  IF NEW.loan_status='Approved' THEN
   IF item.condition_status<>'Good' OR item.available_quantity<item.quantity THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Equipment unavailable.'; END IF;
   UPDATE public.equipment SET available_quantity=available_quantity-item.quantity WHERE equipment_id=item.equipment_id;
   UPDATE public.loan_items SET condition_out=item.condition_status WHERE loan_id=OLD.loan_id AND equipment_id=item.equipment_id;
  ELSE
   IF item.condition_in IS NULL OR item.condition_in NOT IN('Good','Damaged') OR item.quantity>item.total_quantity-item.available_quantity THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Return requires reconciliation.'; END IF;
   UPDATE public.equipment SET available_quantity=available_quantity+item.quantity,condition_status=CASE WHEN item.condition_in='Damaged' THEN 'Damaged' ELSE condition_status END WHERE equipment_id=item.equipment_id;
  END IF;
 END LOOP;
 IF n=0 THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Loan has no items.'; END IF;
 RETURN NEW;
END $loan$;

DROP TRIGGER IF EXISTS loan_workflow ON public.equipment_loans;
CREATE TRIGGER loan_workflow BEFORE INSERT OR UPDATE ON public.equipment_loans
  FOR EACH ROW EXECUTE FUNCTION im101_private.loan_workflow();

-- 10. Loan item guard trigger
CREATE OR REPLACE FUNCTION im101_private.loan_item_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $item$
DECLARE who record; parent public.equipment_loans%ROWTYPE;
BEGIN
 IF TG_RELID<>'public.loan_items'::regclass THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Loan item operation refused.'; END IF;
 SELECT * INTO who FROM im101_private.core_actor();
 SELECT * INTO parent FROM public.equipment_loans WHERE loan_id=NEW.loan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='C4041',MESSAGE='Loan not found.'; END IF;
 IF TG_OP='INSERT' THEN
  IF parent.user_id<>who.actor OR parent.loan_status<>'Pending' OR NEW.quantity<1 OR NEW.condition_out IS NOT NULL OR NEW.condition_in IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid loan item.'; END IF;
 ELSE
  IF NEW.loan_id<>OLD.loan_id OR NEW.equipment_id<>OLD.equipment_id OR NEW.quantity<>OLD.quantity THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Loan item history is immutable.'; END IF;
  IF NEW.condition_out IS DISTINCT FROM OLD.condition_out THEN
   IF pg_trigger_depth()<2 OR who.role_name NOT IN('System Administrator','Facility/Maintenance Staff') OR parent.loan_status<>'Pending' THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Loan condition refused.'; END IF;
  ELSE
   IF parent.loan_status<>'Approved' OR parent.user_id=who.actor OR who.role_name NOT IN('System Administrator','Facility/Maintenance Staff') OR NEW.condition_in IS NULL OR NEW.condition_in NOT IN('Good','Damaged') THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Return condition refused.'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $item$;

DROP TRIGGER IF EXISTS loan_item_guard ON public.loan_items;
CREATE TRIGGER loan_item_guard BEFORE INSERT OR UPDATE ON public.loan_items
  FOR EACH ROW EXECUTE FUNCTION im101_private.loan_item_guard();

-- 11. Equipment quantity bounds guard
CREATE OR REPLACE FUNCTION im101_private.equipment_quantity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $bounds$
BEGIN
 IF NEW.total_quantity<0 OR NEW.available_quantity<0 OR NEW.available_quantity>NEW.total_quantity THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Inventory bounds refused.'; END IF;
 RETURN NEW;
END $bounds$;

DROP TRIGGER IF EXISTS equipment_quantity_guard ON public.equipment;
CREATE TRIGGER equipment_quantity_guard BEFORE INSERT OR UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION im101_private.equipment_quantity_guard();

-- 12. Maintenance request guard
CREATE OR REPLACE FUNCTION im101_private.maintenance_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $request$
DECLARE who record;
BEGIN
 IF TG_RELID<>'public.maintenance_requests'::regclass THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Maintenance operation refused.'; END IF;
 SELECT * INTO who FROM im101_private.core_actor();
 IF NEW.priority NOT IN('Low','Normal','High') OR char_length(btrim(NEW.description)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid maintenance input.'; END IF;
 IF TG_OP='INSERT' THEN
  IF who.role_name NOT IN('System Administrator','Facility/Maintenance Staff','Faculty / Student Organization Representative') OR NEW.reported_by IS DISTINCT FROM who.actor OR (NEW.facility_id IS NULL)=(NEW.equipment_id IS NULL) OR NEW.status<>'Open' OR NEW.assigned_staff_id IS NOT NULL OR NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid maintenance input.'; END IF;
  NEW.reported_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF NEW.request_id<>OLD.request_id OR NEW.facility_id IS DISTINCT FROM OLD.facility_id OR NEW.equipment_id IS DISTINCT FROM OLD.equipment_id OR NEW.reported_by IS DISTINCT FROM OLD.reported_by OR NEW.description<>OLD.description OR NEW.reported_at<>OLD.reported_at THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Maintenance history is immutable.'; END IF;
 IF OLD.status NOT IN('Open','In Progress') THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Maintenance already resolved.'; END IF;
 IF who.role_name<>'System Administrator' THEN
  IF who.role_name<>'Facility/Maintenance Staff' OR (NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id AND (OLD.assigned_staff_id IS NOT NULL OR NEW.assigned_staff_id IS DISTINCT FROM who.actor)) OR (NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id AND OLD.assigned_staff_id IS DISTINCT FROM who.actor) THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Access denied.'; END IF;
 END IF;
 IF NEW.assigned_staff_id IS NOT NULL AND NOT im101_private.core_staff(NEW.assigned_staff_id) THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Eligible staff required.'; END IF;
 IF NOT(NEW.status=OLD.status OR OLD.status='Open' AND NEW.status='In Progress' OR OLD.status='In Progress' AND NEW.status='Resolved') THEN RAISE EXCEPTION USING ERRCODE='C4091',MESSAGE='Maintenance transition conflict.'; END IF;
 IF NEW.status='Resolved' THEN NEW.resolved_at:=clock_timestamp(); ELSE IF NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid resolution time.'; END IF; END IF;
 RETURN NEW;
END $request$;

DROP TRIGGER IF EXISTS maintenance_guard ON public.maintenance_requests;
CREATE TRIGGER maintenance_guard BEFORE INSERT OR UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION im101_private.maintenance_guard();

-- 13. Maintenance log guard
CREATE OR REPLACE FUNCTION im101_private.maintenance_log_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $log$
DECLARE who record;
BEGIN
 IF TG_RELID<>'public.maintenance_logs'::regclass OR TG_WHEN<>'BEFORE' OR TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Log operation refused.'; END IF;
 SELECT * INTO who FROM im101_private.core_actor();
 IF who.role_name NOT IN('System Administrator','Facility/Maintenance Staff') OR NEW.staff_id<>who.actor OR char_length(btrim(NEW.action_taken)) NOT BETWEEN 1 AND 4000 OR (NEW.notes IS NOT NULL AND (char_length(NEW.notes)>4000 OR NEW.notes~'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]')) THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid maintenance log.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.maintenance_requests r WHERE r.request_id=NEW.request_id AND r.status IN('Open','In Progress') AND (who.role_name='System Administrator' OR r.assigned_staff_id=who.actor)) THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Access denied.'; END IF;
 NEW.logged_at:=clock_timestamp();RETURN NEW;
END $log$;

DROP TRIGGER IF EXISTS maintenance_log_guard ON public.maintenance_logs;
CREATE TRIGGER maintenance_log_guard BEFORE INSERT ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION im101_private.maintenance_log_guard();

-- 14. Staff assignment guard
CREATE OR REPLACE FUNCTION im101_private.assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $assignment$
DECLARE who record;
BEGIN
 IF TG_RELID<>'public.facility_staff_assignments'::regclass OR TG_WHEN<>'BEFORE' THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Assignment operation refused.'; END IF;
 SELECT * INTO who FROM im101_private.core_actor();
 IF who.role_name<>'System Administrator' THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Access denied.'; END IF;
 IF NEW.assigned_role NOT IN('Custodian','Maintenance Technician') OR NEW.shift IS NOT NULL AND NEW.shift NOT IN('Day','Evening','Night') OR ((TG_OP='INSERT' OR NEW.unassigned_date IS NULL) AND NOT im101_private.core_staff(NEW.staff_id)) OR NEW.assigned_date>CURRENT_DATE OR NEW.unassigned_date IS NOT NULL AND (NEW.unassigned_date<NEW.assigned_date OR NEW.unassigned_date>CURRENT_DATE) THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Invalid assignment input.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.assignment_id<>OLD.assignment_id OR NEW.facility_id<>OLD.facility_id OR NEW.staff_id<>OLD.staff_id OR NEW.assigned_date<>OLD.assigned_date) THEN RAISE EXCEPTION USING ERRCODE='C4001',MESSAGE='Assignment history is immutable.'; END IF;
 RETURN NEW;
END $assignment$;

DROP TRIGGER IF EXISTS assignment_guard ON public.facility_staff_assignments;
CREATE TRIGGER assignment_guard BEFORE INSERT OR UPDATE ON public.facility_staff_assignments
  FOR EACH ROW EXECUTE FUNCTION im101_private.assignment_guard();

-- 15. Core audit trigger for loans, maintenance, assignments
CREATE OR REPLACE FUNCTION im101_private.audit_core() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $audit$
DECLARE raw text; actor integer; record_key integer; before_value jsonb; after_value jsonb;
BEGIN
 IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_OP NOT IN('INSERT','UPDATE','DELETE') THEN RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Core audit refused.'; END IF;
 raw:=current_setting('im101.actor_id',true);
 IF raw IS NULL OR length(raw) NOT BETWEEN 1 AND 10 OR raw !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION USING ERRCODE='C4011',MESSAGE='Actor required.'; END IF;
 IF raw::bigint>2147483647 THEN RAISE EXCEPTION USING ERRCODE='C4011',MESSAGE='Actor required.'; END IF;
 actor:=raw::integer;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE user_id=actor AND is_active) THEN RAISE EXCEPTION USING ERRCODE='C4011',MESSAGE='Actor required.'; END IF;
 IF TG_RELID='public.equipment_loans'::regclass THEN
  record_key:=CASE WHEN TG_OP='DELETE' THEN OLD.loan_id ELSE NEW.loan_id END;
  IF TG_OP<>'INSERT' THEN before_value:=jsonb_build_object('loan_id',OLD.loan_id,'user_id',OLD.user_id,'approved_by',OLD.approved_by,'requested_at',OLD.requested_at,'due_date',OLD.due_date,'return_date',OLD.return_date,'loan_status',OLD.loan_status); END IF;
  IF TG_OP<>'DELETE' THEN after_value:=jsonb_build_object('loan_id',NEW.loan_id,'user_id',NEW.user_id,'approved_by',NEW.approved_by,'requested_at',NEW.requested_at,'due_date',NEW.due_date,'return_date',NEW.return_date,'loan_status',NEW.loan_status); END IF;
 ELSIF TG_RELID='public.maintenance_requests'::regclass THEN
  record_key:=CASE WHEN TG_OP='DELETE' THEN OLD.request_id ELSE NEW.request_id END;
  IF TG_OP<>'INSERT' THEN before_value:=jsonb_build_object('request_id',OLD.request_id,'facility_id',OLD.facility_id,'equipment_id',OLD.equipment_id,'reported_by',OLD.reported_by,'assigned_staff_id',OLD.assigned_staff_id,'priority',OLD.priority,'status',OLD.status,'reported_at',OLD.reported_at,'resolved_at',OLD.resolved_at); END IF;
  IF TG_OP<>'DELETE' THEN after_value:=jsonb_build_object('request_id',NEW.request_id,'facility_id',NEW.facility_id,'equipment_id',NEW.equipment_id,'reported_by',NEW.reported_by,'assigned_staff_id',NEW.assigned_staff_id,'priority',NEW.priority,'status',NEW.status,'reported_at',NEW.reported_at,'resolved_at',NEW.resolved_at); END IF;
 ELSIF TG_RELID='public.maintenance_logs'::regclass THEN
  record_key:=CASE WHEN TG_OP='DELETE' THEN OLD.log_id ELSE NEW.log_id END;
  IF TG_OP<>'INSERT' THEN before_value:=jsonb_build_object('log_id',OLD.log_id,'request_id',OLD.request_id,'staff_id',OLD.staff_id,'logged_at',OLD.logged_at); END IF;
  IF TG_OP<>'DELETE' THEN after_value:=jsonb_build_object('log_id',NEW.log_id,'request_id',NEW.request_id,'staff_id',NEW.staff_id,'logged_at',NEW.logged_at); END IF;
 ELSIF TG_RELID='public.facility_staff_assignments'::regclass THEN
  record_key:=CASE WHEN TG_OP='DELETE' THEN OLD.assignment_id ELSE NEW.assignment_id END;
  IF TG_OP<>'INSERT' THEN before_value:=jsonb_build_object('assignment_id',OLD.assignment_id,'facility_id',OLD.facility_id,'staff_id',OLD.staff_id,'assigned_role',OLD.assigned_role,'shift',OLD.shift,'assigned_date',OLD.assigned_date,'unassigned_date',OLD.unassigned_date); END IF;
  IF TG_OP<>'DELETE' THEN after_value:=jsonb_build_object('assignment_id',NEW.assignment_id,'facility_id',NEW.facility_id,'staff_id',NEW.staff_id,'assigned_role',NEW.assigned_role,'shift',NEW.shift,'assigned_date',NEW.assigned_date,'unassigned_date',NEW.unassigned_date); END IF;
 ELSE RAISE EXCEPTION USING ERRCODE='C4031',MESSAGE='Core audit refused.'; END IF;
 INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value) VALUES(TG_TABLE_NAME,record_key,TG_OP,actor,before_value,after_value);
 RETURN NULL;
END $audit$;

DROP TRIGGER IF EXISTS core_audit ON public.equipment_loans;
CREATE TRIGGER core_audit AFTER INSERT OR UPDATE OR DELETE ON public.equipment_loans FOR EACH ROW EXECUTE FUNCTION im101_private.audit_core();

DROP TRIGGER IF EXISTS core_audit ON public.maintenance_requests;
CREATE TRIGGER core_audit AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION im101_private.audit_core();

DROP TRIGGER IF EXISTS core_audit ON public.maintenance_logs;
CREATE TRIGGER core_audit AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_logs FOR EACH ROW EXECUTE FUNCTION im101_private.audit_core();

DROP TRIGGER IF EXISTS core_audit ON public.facility_staff_assignments;
CREATE TRIGGER core_audit AFTER INSERT OR UPDATE OR DELETE ON public.facility_staff_assignments FOR EACH ROW EXECUTE FUNCTION im101_private.audit_core();

