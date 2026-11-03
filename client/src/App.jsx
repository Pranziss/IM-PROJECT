import React, {
    useEffect,
    useState,
    useRef,
    useMemo,
    useCallback,
} from "react";
import { useSession, roles } from "./session";
import { resources, labels } from "./resources";
import { Alert, Badge, Editor, Icon, RecordDetails } from "./components";
import { displayValue, recordReference } from "./presentation";
import { useRecordNames } from "./names";
import ReservationCalendar from "./ReservationCalendar";
import Dashboard from "./Dashboard";
import CampusIllustration from "./CampusIllustration";
import { AccountForm, AccountManagement } from "./AccountForm";
import {
    AppShell,
    Profile,
    navigation,
    PageHeader,
    DataTable,
    ResourceCard,
    EmptyState as Empty,
    Skeleton,
    Toast,
    requestLink,
    rowTitle,
} from "./ui";
const isAdmin = (user) => user.role.roleName === roles[0],
    isStaff = (user) => user.role.roleName === roles[1];
function useRoute() {
    const [route, setRoute] = useState(
        () => window.location.hash.replace(/^#\/?/, "") || "overview",
    );
    useEffect(() => {
        const change = () =>
            setRoute(window.location.hash.replace(/^#\/?/, "") || "overview");
        window.addEventListener("hashchange", change);
        return () => window.removeEventListener("hashchange", change);
    }, []);
    return route;
}
export function Login({ signup = false }) {
    const { login, notice } = useSession();
    const [email, setEmail] = useState(""),
        [password, setPassword] = useState(""),
        [showPassword, setShowPassword] = useState(false),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    const pending = useRef(false);
    async function submit(event) {
        event.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError("");
        try {
            await login(email.trim(), password);
            setPassword("");
        } catch (error) {
            setError(error.message || "Unable to sign in.");
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return (
        <div className="login-page">
            <div className="login-layout">
                <main className="login-main">
                    <div className="login-card">
                        <nav className="auth-tabs" aria-label="Account access">
                            <a
                                href="#/login"
                                aria-current={!signup ? "page" : undefined}
                            >
                                Log In
                            </a>
                            <a
                                href="#/signup"
                                aria-current={signup ? "page" : undefined}
                            >
                                Sign Up
                            </a>
                        </nav>
                        {signup ? (
                            <>
                                <p className="eyebrow">JOIN YOUR CAMPUS</p>
                                <h2>Create an account</h2>
                                <p className="muted">
                                    Request facilities and borrow equipment as a
                                    Representative. Staff accounts are created
                                    by an administrator.
                                </p>
                                <AccountForm />
                            </>
                        ) : (
                            <>
                                <p className="eyebrow">YOUR CAMPUS WORKSPACE</p>
                                <h2>Welcome back</h2>
                                <p className="muted">
                                    Everything you need for your next campus
                                    activity.
                                </p>
                                {notice && (
                                    <p className="notice" role="status">
                                        {notice}
                                    </p>
                                )}
                                <Alert>{error}</Alert>
                                <form onSubmit={submit}>
                                    <label htmlFor="login-email">
                                        Campus email
                                    </label>
                                    <input
                                        id="login-email"
                                        type="email"
                                        autoComplete="username"
                                        placeholder="you@university.edu"
                                        value={email}
                                        onChange={(event) =>
                                            setEmail(event.target.value)
                                        }
                                        required
                                        disabled={busy}
                                    />
                                    <label htmlFor="login-password">
                                        Password
                                    </label>
                                    <div className="password-control">
                                        <input
                                            id="login-password"
                                            type={
                                                showPassword
                                                    ? "text"
                                                    : "password"
                                            }
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(event) =>
                                                setPassword(event.target.value)
                                            }
                                            required
                                            disabled={busy}
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            aria-label={
                                                showPassword
                                                    ? "Hide password"
                                                    : "Show password"
                                            }
                                            aria-pressed={showPassword}
                                            aria-controls="login-password"
                                            disabled={busy}
                                            onClick={() =>
                                                setShowPassword(
                                                    (value) => !value,
                                                )
                                            }
                                        >
                                            {showPassword ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                    <button
                                        className="button primary login-submit"
                                        disabled={busy}
                                    >
                                        {busy
                                            ? "Signing in…"
                                            : "Sign in to workspace"}
                                        <span aria-hidden="true">→</span>
                                    </button>
                                </form>
                                <p className="login-help">
                                    Need an account or password help? Contact
                                    your system administrator.
                                </p>
                                <p className="security-note">
                                    Your session stays in memory and ends when
                                    this page reloads.
                                </p>
                            </>
                        )}
                    </div>
                </main>
                <aside className="login-story">
                    <div className="brand light">
                        <span className="brand-mark">C</span>
                        <div>
                            Campus<span>FACILITIES & SERVICES</span>
                        </div>
                    </div>
                    <div className="story-copy">
                        <p className="eyebrow">ONE CONNECTED CAMPUS</p>
                        <h1>
                            Your campus.
                            <br />
                            One place.
                        </h1>
                        <p>
                            Find a space. Bring your plans to life. A simpler
                            way to reserve, borrow and care for the spaces we
                            share.
                        </p>
                        <CampusIllustration />
                        <div className="login-features">
                            <div>
                                <Icon name="reservations" />
                                <span>
                                    <strong>Make room for your ideas</strong>
                                    <small>
                                        Find and request the right campus space.
                                    </small>
                                </span>
                            </div>
                            <div>
                                <Icon name="equipment" />
                                <span>
                                    <strong>Bring what you need</strong>
                                    <small>
                                        Borrow equipment for your next activity.
                                    </small>
                                </span>
                            </div>
                            <div>
                                <Icon name="maintenance" />
                                <span>
                                    <strong>Keep campus at its best</strong>
                                    <small>
                                        Report an issue and follow its progress.
                                    </small>
                                </span>
                            </div>
                        </div>
                    </div>
                    <p className="story-footer">
                        Campus Facility Management System · IM101
                    </p>
                </aside>
            </div>
        </div>
    );
}
function useCatalogs(user, api, revision) {
    const [catalogs, setCatalogs] = useState({});
    const [pages, setPages] = useState({}),
        [loadingMore, setLoadingMore] = useState({});
    const controllerRef = useRef(null),
        pending = useRef(new Set());
    useEffect(() => {
        if (!user) {
            setCatalogs({});
            return;
        }
        const controller = new AbortController();
        controllerRef.current = controller;
        pending.current.clear();
        setPages({});
        setLoadingMore({});
        setCatalogs({});
        const endpoints = [
            ["buildings", "/buildings?limit=100", "buildings"],
            ["facilities", "/facilities?limit=100", "facilities"],
            ["equipment", "/equipment?limit=100", "equipment"],
            ["types", "/facility-types?limit=100", "facilityTypes"],
            [
                "categories",
                "/equipment-categories?limit=100",
                "equipmentCategories",
            ],
            ["statuses", "/reservation-statuses", "reservationStatuses"],
            ...(isAdmin(user) ? [["staff", "/staff?limit=100", "staff"]] : []),
        ];
        Promise.all(
            endpoints.map(async ([key, path, resultKey]) => {
                const data = await api.request(path, {
                    signal: controller.signal,
                });
                return {
                    key,
                    rows: data[resultKey],
                    more: Boolean(data.pagination?.hasMore),
                    resultKey,
                    path: path.split("?")[0],
                };
            }),
        )
            .then((entries) => {
                if (!controller.signal.aborted) {
                    setCatalogs(
                        Object.fromEntries(
                            entries.map((entry) => [entry.key, entry.rows]),
                        ),
                    );
                    setPages(
                        Object.fromEntries(
                            entries.map((entry) => [
                                entry.key,
                                { ...entry, page: 1 },
                            ]),
                        ),
                    );
                }
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setCatalogs({ unavailable: true });
            });
        return () => controller.abort();
    }, [user, api, revision]);
    const loadMore = useCallback(
        async (key) => {
            const entry = pages[key],
                controller = controllerRef.current;
            if (
                !entry?.more ||
                pending.current.has(key) ||
                !controller ||
                controller.signal.aborted
            )
                return;
            pending.current.add(key);
            setLoadingMore((previous) => ({ ...previous, [key]: true }));
            try {
                const data = await api.request(
                    `${entry.path}?limit=100&page=${entry.page + 1}`,
                    { signal: controller.signal },
                );
                if (!controller.signal.aborted) {
                    setCatalogs((previous) => ({
                        ...previous,
                        [key]: [...previous[key], ...data[entry.resultKey]],
                    }));
                    setPages((previous) => ({
                        ...previous,
                        [key]: {
                            ...entry,
                            page: entry.page + 1,
                            more: data.pagination.hasMore,
                        },
                    }));
                }
            } catch {
                if (!controller.signal.aborted)
                    setCatalogs((previous) => ({
                        ...previous,
                        unavailable: true,
                    }));
            } finally {
                if (!controller.signal.aborted) {
                    pending.current.delete(key);
                    setLoadingMore((previous) => ({
                        ...previous,
                        [key]: false,
                    }));
                }
            }
        },
        [api, pages],
    );
    return useMemo(
        () => ({
            ...catalogs,
            loadMore,
            loadingMore,
            viewer: user,
            hasMore: Object.fromEntries(
                Object.entries(pages).map(([key, value]) => [key, value.more]),
            ),
        }),
        [catalogs, loadMore, loadingMore, pages, user],
    );
}
function ResourcePage({
    name,
    catalogs,
    onChange,
    pageTitle,
    calendarOnly = false,
    intent = "",
}) {
    const resource = resources[name],
        { api, user } = useSession();
    const [rows, setRows] = useState([]),
        [page, setPage] = useState(1),
        [hasMore, setHasMore] = useState(false),
        [filter, setFilter] = useState(""),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(""),
        [revision, setRevision] = useState(0),
        [modal, setModal] = useState(null),
        [details, setDetails] = useState(null),
        [toast, setToast] = useState("");
    const [reservationView, setReservationView] = useState(
        calendarOnly ? "calendar" : "list",
    );
    const [search, setSearch] = useState(""),
        [catalogView, setCatalogView] = useState(
            isAdmin(user) ? "table" : "cards",
        ),
        [assignedOnly, setAssignedOnly] = useState(
            name === "maintenance" && isStaff(user),
        );
    const consumedIntent = useRef(false);
    const names = useRecordNames(rows, catalogs, api);
    const refresh = () => setRevision((value) => value + 1);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const query = new URLSearchParams({ page: String(page), limit: "20" });
        if (filter && ["loans", "maintenance"].includes(name))
            query.set("status", filter);
        if (filter && name === "assignments") query.set("active", filter);
        if (name === "maintenance" && assignedOnly)
            query.set("assignedStaffId", String(user.userId));
        api.request(resource.path + "?" + query, { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) {
                    setRows(data[resource.key]);
                    setHasMore(data.pagination.hasMore);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [
        api,
        resource,
        name,
        page,
        filter,
        revision,
        assignedOnly,
        user.userId,
    ]);
    const enriched = rows.map((row) => ({
        ...row,
        ...(name === "reservations"
            ? {
                  statusName:
                      catalogs.statuses?.find(
                          (status) => status.statusId === row.statusId,
                      )?.statusName || "Status unavailable",
              }
            : {}),
    }));
    const visible = enriched.filter(
        (row) =>
            (!assignedOnly || row.assignedStaffId === user.userId) &&
            (!search.trim() ||
                Object.keys(labels).some(
                    (key) =>
                        Object.hasOwn(row, key) &&
                        displayValue(row, key, names, true)
                            .toLowerCase()
                            .includes(search.trim().toLowerCase()),
                )),
    );
    useEffect(() => {
        if (consumedIntent.current) return;
        consumedIntent.current = true;
        const query = new URLSearchParams(intent);
        if (query.get("create") !== "1") return;
        if ((resource.manage || name === "assignments") && !isAdmin(user))
            return;
        const facility = Number(query.get("facility")),
            equipment = Number(query.get("equipment"));
        edit(null, {
            ...(name === "reservations" &&
            Number.isInteger(facility) &&
            facility > 0 &&
            facility <= 2147483647
                ? { facilityId: facility }
                : {}),
            ...(name === "loans" &&
            Number.isInteger(equipment) &&
            equipment > 0 &&
            equipment <= 2147483647
                ? { items: [{ equipmentId: equipment, quantity: 1 }] }
                : {}),
        });
    }, []);
    function edit(row, defaults = {}) {
        setModal({
            title: row
                ? `Edit ${resource.singular}`
                : `New ${resource.singular}`,
            fields: resource.fields,
            initial: row || defaults,
            formKind: name,
            confirmLabel: row ? "Save changes" : "Submit request",
            onSubmit: async (data) => {
                if (name === "maintenance") {
                    const { targetKind, targetId, ...rest } = data;
                    data = { ...rest, [targetKind]: targetId };
                }
                await api.request(
                    resource.path + (row ? "/" + row[resource.id] : ""),
                    { method: row ? "PUT" : "POST", body: data },
                );
                setToast("Saved successfully.");
                refresh();
                onChange();
            },
            loanItems: name === "loans",
            notice:
                name === "reservations"
                    ? `Times use ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Maximum 8 hours; both endpoints within 90 days. Pending requests do not guarantee a booking.`
                    : name === "loans"
                      ? "Pending requests do not reserve stock. Due dates must be future and within 90 days."
                      : name === "assignments"
                        ? "Assignment dates use UTC calendar days. End assignments to retain their history."
                        : null,
        });
        if (name === "loans")
            setModal((previous) => ({
                ...previous,
                fields: [["dueDate", "Due date & time", "datetime"]],
            }));
    }
    async function view(row) {
        try {
            const data = await api.request(
                resource.path + "/" + row[resource.id],
            );
            setDetails({
                ...data[
                    name === "maintenance"
                        ? "maintenanceRequest"
                        : resource.singular
                ],
                ...(name === "reservations"
                    ? { statusName: row.statusName }
                    : {}),
            });
        } catch (error) {
            setError(error.message);
        }
    }
    function action(row, type) {
        const id = row[resource.id];
        let fields = [],
            method = "POST",
            path = `${resource.path}/${id}/${type}`,
            bodyTransform = (value) => value,
            notice = "Review this record before confirming.";
        if (type === "delete") {
            method = "DELETE";
            path = resource.path + "/" + id;
            notice =
                "This permanently deletes this management record if it has no dependent history. This cannot be undone.";
        }
        if (type === "return") {
            notice =
                "Confirm physical return of every item. Stock is restored exactly once. Damaged returns quarantine the equipment pool.";
        }
        if (type === "assign") {
            fields = [["staffId", "Maintenance staff", "number", "staff"]];
            notice = "Assign this request to active maintenance staff.";
        }
        if (type === "claim") {
            path = `${resource.path}/${id}/assign`;
            bodyTransform = () => ({ staffId: user.userId });
            notice = "Assign this unclaimed request to yourself.";
        }
        if (type === "start" || type === "resolve") {
            path = `${resource.path}/${id}/progress`;
            fields = [["actionTaken", "Maintenance action", "textarea", 2000]];
            bodyTransform = (data) => ({
                ...data,
                status: type === "start" ? "In Progress" : "Resolved",
            });
        }
        if (type === "log") {
            path = `${resource.path}/${id}/logs`;
            fields = [["actionTaken", "Maintenance action", "textarea", 2000]];
        }
        if (type === "priority") {
            path = `${resource.path}/${id}/priority`;
            method = "PATCH";
            fields = [
                ["priority", "Priority", "select", ["Normal", "Low", "High"]],
            ];
        }
        if (type === "assignmentEdit") {
            method = "PATCH";
            path = resource.path + "/" + id;
            fields = [
                [
                    "assignedRole",
                    "Assigned role",
                    "select",
                    ["Custodian", "Maintenance Technician"],
                ],
                ["shift", "Shift", "select", ["", "Day", "Evening", "Night"]],
            ];
        }
        if (type === "end") {
            fields = [["unassignedDate", "End date (UTC)", "date"]];
            notice = "End this assignment without deleting its history.";
        }
        if (type === "approve")
            notice =
                name === "loans"
                    ? "Approval reserves the requested equipment now."
                    : "Approval blocks this facility time slot after conflict checks.";
        if (type === "reject")
            notice =
                "Reject this Pending request. This transition cannot be reopened.";
        if (type === "cancel")
            notice =
                "Cancel this unstarted reservation. It cannot be reopened.";
        const captions = {
            approve: "Approve",
            reject: "Reject",
            cancel: "Cancel reservation",
            return: "Record return",
            assign: "Assign maintenance",
            claim: "Claim maintenance",
            start: "Start work",
            resolve: "Resolve request",
            log: "Record maintenance action",
            priority: "Change priority",
            assignmentEdit: "Update assignment",
            end: "End assignment",
            delete: "Delete",
        };
        setModal({
            title: `${captions[type]} · ${rowTitle(row)}${resource.manage ? "" : " · " + recordReference(row)}`,
            fields,
            initial: row,
            returnItems: type === "return" ? row.items : null,
            notice,
            confirmLabel: `Confirm ${type === "delete" ? "deletion" : captions[type].toLowerCase()}`,
            onSubmit: async (value) => {
                await api.request(path, {
                    method,
                    ...(type === "delete"
                        ? {}
                        : { body: bodyTransform(value) }),
                });
                setToast("Operation confirmed.");
                refresh();
                onChange();
            },
        });
    }
    function actions(row) {
        const list = [];
        if (resource.manage && isAdmin(user)) {
            list.push(["edit", "Edit"], ["delete", "Delete"]);
        }
        if (name === "reservations") {
            if (
                isAdmin(user) &&
                row.requestedBy !== user.userId &&
                row.statusName === "Pending"
            )
                list.push(["approve", "Approve"], ["reject", "Reject"]);
            if (
                (isAdmin(user) || row.requestedBy === user.userId) &&
                ["Pending", "Approved"].includes(row.statusName) &&
                new Date(row.startDatetime) > new Date()
            )
                list.push(["cancel", "Cancel"]);
        }
        if (
            name === "loans" &&
            (isAdmin(user) || isStaff(user)) &&
            row.userId !== user.userId
        ) {
            if (row.loanStatus === "Pending")
                list.push(["approve", "Approve"], ["reject", "Reject"]);
            if (row.loanStatus === "Approved") list.push(["return", "Return"]);
        }
        if (name === "maintenance" && row.status !== "Resolved") {
            const worker =
                isAdmin(user) ||
                (isStaff(user) && row.assignedStaffId === user.userId);
            if (isAdmin(user)) list.push(["assign", "Assign"]);
            else if (isStaff(user) && row.assignedStaffId === null)
                list.push(["claim", "Claim"]);
            if (worker) {
                if (row.status === "Open") list.push(["start", "Start"]);
                if (row.status === "In Progress")
                    list.push(["log", "Add action"], ["resolve", "Resolve"]);
                list.push(["priority", "Priority"]);
            }
        }
        if (name === "assignments" && isAdmin(user) && !row.unassignedDate)
            list.push(["assignmentEdit", "Update"], ["end", "End"]);
        return list;
    }

    const canCreate = resource.manage
        ? isAdmin(user)
        : name !== "assignments" || isAdmin(user);
    const createLabel = resource.manage
        ? "Add " + resource.singular
        : name === "assignments"
          ? "Create assignment"
          : name === "reservations"
            ? "Request a facility"
            : name === "loans"
              ? "Request equipment"
              : "Report an issue";
    const renderActions = (row) => (
        <>
            <button onClick={() => view(row)}>View Details</button>
            {actions(row).map(([type, label]) => (
                <button
                    key={type}
                    className={
                        ["delete", "reject", "cancel"].includes(type)
                            ? "danger-link"
                            : ""
                    }
                    onClick={() =>
                        type === "edit" ? edit(row) : action(row, type)
                    }
                >
                    {label}
                </button>
            ))}
        </>
    );
    return (
        <>
            <PageHeader
                title={pageTitle || resource.title}
                description={
                    calendarOnly
                        ? "Approved reservations you are allowed to view. Select an event for full details."
                        : resource.description
                }
            >
                {canCreate && (
                    <button
                        className="button primary"
                        onClick={() => edit(null)}
                    >
                        <span aria-hidden="true">＋</span>
                        {createLabel}
                    </button>
                )}
            </PageHeader>
            <Alert>{error}</Alert>
            {catalogs.unavailable && (
                <p className="notice">
                    Some resource names could not be loaded. Use Refresh to try
                    again.
                </p>
            )}
            {name === "reservations" && (
                <div
                    className="reservation-view-switch"
                    role="group"
                    aria-label="Reservation view"
                >
                    <button
                        className="button secondary"
                        aria-pressed={reservationView === "list"}
                        onClick={() => {
                            if (calendarOnly)
                                window.location.hash = "#/reservations";
                            else setReservationView("list");
                        }}
                    >
                        List view
                    </button>
                    <button
                        className="button secondary"
                        aria-pressed={reservationView === "calendar"}
                        onClick={() => {
                            window.location.hash = "#/calendar";
                        }}
                    >
                        Availability calendar
                    </button>
                    <span className="scope-note">
                        {reservationView === "calendar"
                            ? "Campus-wide time slots; private details are hidden"
                            : isAdmin(user)
                              ? "All authorized campus requests"
                              : "Only your reservations are shown"}
                    </span>
                </div>
            )}
            <Toast onClose={() => setToast("")}>{toast}</Toast>
            {name === "reservations" && reservationView === "calendar" ? (
                <ReservationCalendar
                    api={api}
                    catalogs={catalogs}
                    refreshKey={revision}
                    onRefreshCatalogs={onChange}
                />
            ) : (
                <section className="panel table-panel">
                    <div className="table-toolbar">
                        <label className="search-control">
                            <Icon name="search" />
                            <input
                                type="search"
                                aria-label="Search this page"
                                placeholder={
                                    "Search " +
                                    resource.title.toLowerCase() +
                                    " on this page?"
                                }
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                            />
                        </label>
                        <div className="toolbar-actions">
                            {["loans", "maintenance", "assignments"].includes(
                                name,
                            ) && (
                                <label className="filter-label">
                                    {name === "assignments"
                                        ? "Assignment"
                                        : "Status"}
                                    <select
                                        aria-label="Filter records"
                                        value={filter}
                                        onChange={(event) => {
                                            setFilter(event.target.value);
                                            setPage(1);
                                        }}
                                    >
                                        <option value="">All history</option>
                                        {(name === "loans"
                                            ? [
                                                  "Pending",
                                                  "Approved",
                                                  "Rejected",
                                                  "Returned",
                                              ]
                                            : name === "maintenance"
                                              ? [
                                                    "Open",
                                                    "In Progress",
                                                    "Resolved",
                                                ]
                                              : ["true", "false"]
                                        ).map((value) => (
                                            <option key={value} value={value}>
                                                {value === "true"
                                                    ? "Active"
                                                    : value === "false"
                                                      ? "Ended"
                                                      : value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {name === "maintenance" && isStaff(user) && (
                                <label className="check-filter">
                                    <input
                                        type="checkbox"
                                        checked={assignedOnly}
                                        onChange={(event) => {
                                            setAssignedOnly(
                                                event.target.checked,
                                            );
                                            setPage(1);
                                        }}
                                    />
                                    Assigned to me
                                </label>
                            )}
                            {["facilities", "equipment"].includes(name) && (
                                <div
                                    className="view-toggle"
                                    role="group"
                                    aria-label="Resource layout"
                                >
                                    <button
                                        className={
                                            catalogView === "cards"
                                                ? "selected"
                                                : ""
                                        }
                                        aria-pressed={catalogView === "cards"}
                                        onClick={() => setCatalogView("cards")}
                                    >
                                        Cards
                                    </button>
                                    <button
                                        className={
                                            catalogView === "table"
                                                ? "selected"
                                                : ""
                                        }
                                        aria-pressed={catalogView === "table"}
                                        onClick={() => setCatalogView("table")}
                                    >
                                        Table
                                    </button>
                                </div>
                            )}
                            <button
                                className="button secondary small"
                                disabled={loading}
                                onClick={() => {
                                    refresh();
                                    onChange();
                                }}
                            >
                                Refresh
                            </button>
                        </div>
                    </div>
                    <div className="collection-meta">
                        <span>
                            {loading
                                ? "Loading records…"
                                : visible.length + " shown"}{" "}
                            ? page {page}
                        </span>
                        <span>Search applies to this page</span>
                    </div>
                    {loading ? (
                        <Skeleton
                            cards={
                                catalogView === "cards" &&
                                ["facilities", "equipment"].includes(name)
                            }
                            label={
                                "Loading " + resource.title.toLowerCase() + "?"
                            }
                        />
                    ) : error ? (
                        <Empty
                            title="Unable to load records"
                            text="Check your connection and use Refresh to try again."
                        />
                    ) : !visible.length ? (
                        <Empty
                            icon={name}
                            title={
                                search
                                    ? "No matches on this page"
                                    : filter || assignedOnly
                                      ? "No matching requests"
                                      : "Nothing here yet"
                            }
                            text={
                                search
                                    ? "Try another name, clear your search, or check the next page."
                                    : name === "reservations"
                                      ? "Your requests and their decisions will appear here."
                                      : name === "maintenance"
                                        ? "New reports or assigned work will appear here."
                                        : "Records you are allowed to view will appear here."
                            }
                        >
                            {search && (
                                <button
                                    className="button secondary"
                                    onClick={() => setSearch("")}
                                >
                                    Clear search
                                </button>
                            )}
                        </Empty>
                    ) : ["facilities", "equipment"].includes(name) &&
                      catalogView === "cards" ? (
                        <div className="resource-grid">
                            {visible.map((row) => (
                                <ResourceCard
                                    key={row[resource.id]}
                                    row={row}
                                    kind={name}
                                    catalogs={names}
                                    onDetails={() => view(row)}
                                    onRequest={() => {
                                        window.location.hash = requestLink(
                                            name,
                                            row[resource.id],
                                        );
                                    }}
                                    manage={
                                        isAdmin(user) ? (
                                            <div className="row-actions">
                                                <button
                                                    onClick={() => edit(row)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="danger-link"
                                                    onClick={() =>
                                                        action(row, "delete")
                                                    }
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        ) : null
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <DataTable
                            rows={visible}
                            rowKey={resource.id}
                            columns={resource.columns.map((key) => ({
                                key,
                                label: labels[key] || key,
                            }))}
                            renderCell={(row, key) =>
                                [
                                    "status",
                                    "statusName",
                                    "loanStatus",
                                    "conditionStatus",
                                    "priority",
                                ].includes(key) ? (
                                    <Badge value={row[key]} />
                                ) : (
                                    <span
                                        className="cell-text"
                                        title={displayValue(row, key, names)}
                                    >
                                        {displayValue(row, key, names)}
                                    </span>
                                )
                            }
                            renderActions={renderActions}
                        />
                    )}
                    <div className="pagination">
                        <span>
                            20 records per page · permissions follow your
                            account
                        </span>
                        <div>
                            <button
                                className="button secondary small"
                                disabled={page === 1 || loading}
                                onClick={() => setPage(page - 1)}
                            >
                                ← Previous
                            </button>
                            <span className="page-number">{page}</span>
                            <button
                                className="button secondary small"
                                disabled={!hasMore || loading}
                                onClick={() => setPage(page + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                </section>
            )}
            {modal && (
                <Editor
                    {...modal}
                    catalogs={names}
                    onClose={() => setModal(null)}
                />
            )}
            {details && (
                <RecordDetails
                    row={details}
                    catalogs={names}
                    onClose={() => setDetails(null)}
                />
            )}
        </>
    );
}
export default function App() {
    const { user, api, logout, restoring } = useSession();
    const location = useRoute(),
        [requestedRoute, query = ""] = location.split("?");
    const route =
        user && ["login", "signup"].includes(requestedRoute)
            ? "overview"
            : requestedRoute;
    const [revision, setRevision] = useState(0);
    const catalogs = useCatalogs(user, api, revision);
    if (!user && restoring)
        return (
            <main className="session-restore">
                <Skeleton label="Restoring your session…" />
            </main>
        );
    if (!user) return <Login signup={route === "signup"} />;
    const allowed =
        (route !== "buildings" || isAdmin(user)) &&
        (route !== "accounts" || isAdmin(user)) &&
        (route !== "assignments" || isAdmin(user) || isStaff(user));
    const pageTitle = navigation(user.role.roleName).find(
        ([key]) => key === route,
    )?.[1];
    return (
        <AppShell user={user} route={route} logout={logout}>
            {!allowed ? (
                <Empty
                    title="Access restricted"
                    text="This workspace is not available for your role."
                />
            ) : route === "overview" ? (
                <Dashboard catalogs={catalogs} />
            ) : route === "accounts" ? (
                <AccountManagement />
            ) : route === "profile" ? (
                <Profile user={user} logout={logout} />
            ) : route === "calendar" || Object.hasOwn(resources, route) ? (
                <ResourcePage
                    key={location}
                    name={route === "calendar" ? "reservations" : route}
                    pageTitle={pageTitle}
                    calendarOnly={route === "calendar"}
                    intent={query}
                    catalogs={catalogs}
                    onChange={() => setRevision((value) => value + 1)}
                />
            ) : (
                <Empty
                    title="Page not found"
                    text="Choose a workspace from the navigation."
                />
            )}
        </AppShell>
    );
}
