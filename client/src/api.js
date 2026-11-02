const messages = {
    429: "Too many account creation attempts. Try again later.",
    413: "This request is too large. Shorten the description or item list.",
    415: "Use the supported JSON request format.",
    400: "Check the form fields and try again.",
    401: "Your session expired. Please sign in again.",
    403: "You do not have permission for this action.",
    404: "This record is unavailable or you cannot access it.",
    409: "The record changed or conflicts with another request. Refresh before taking another action.",
    500: "The service could not confirm this operation. Refresh history before resubmitting.",
    503: "This workflow is not configured yet. Contact your administrator.",
};
export class ApiError extends Error {
    constructor(status, message, requiresRefresh = false, code = null) {
        super(message);
        this.status = status;
        this.requiresRefresh = requiresRefresh;
        this.code = code;
    }
}
export function createApi({
    fetchImpl = (...args) => fetch(...args),
    onUnauthorized = () => {},
} = {}) {
    let token = null,
        generation = 0;
    return {
        setToken(value) {
            token = value;
            generation++;
        },
        async request(
            path,
            { method = "GET", body, signal, publicRequest = false } = {},
        ) {
            const version = generation;
            let response;
            try {
                response = await fetchImpl("/api" + path, {
                    method,
                    signal:
                        typeof AbortSignal.timeout === "function"
                            ? signal
                                ? AbortSignal.any([
                                      signal,
                                      AbortSignal.timeout(20000),
                                  ])
                                : AbortSignal.timeout(20000)
                            : signal,
                    credentials: "omit",
                    redirect: "error",
                    headers: {
                        ...(body !== undefined
                            ? { "Content-Type": "application/json" }
                            : {}),
                        ...(!publicRequest && token
                            ? { Authorization: "Bearer " + token }
                            : {}),
                    },
                    ...(body !== undefined
                        ? { body: JSON.stringify(body) }
                        : {}),
                });
            } catch (error) {
                if (error?.name === "AbortError") throw error;
                throw new ApiError(
                    0,
                    publicRequest
                        ? "Unable to sign in. Check your connection."
                        : method === "GET"
                          ? "Unable to load data. Check your connection."
                          : "The outcome could not be confirmed. Refresh history before resubmitting.",
                    !publicRequest && method !== "GET",
                );
            }
            if (version !== generation)
                throw new ApiError(0, "Session changed. Please reload.");
            if (response.status === 401 && !publicRequest) onUnauthorized();
            let data;
            try {
                data = await response.json();
            } catch {
                throw new ApiError(
                    response.status,
                    "The service returned an unreadable response.",
                    method !== "GET",
                );
            }
            if (!response.ok || data?.success !== true) {
                const reservationWrite =
                    method !== "GET" &&
                    /^\/reservations(?:$|\/\d+\/(?:approve|reject|cancel)$)/.test(
                        path,
                    );
                const reservationCode =
                    reservationWrite &&
                    response.status === 409 &&
                    [
                        "RESERVATION_SCHEDULE_CONFLICT",
                        "RESERVATION_CONFLICT",
                    ].includes(data?.code)
                        ? data.code
                        : null;
                let message =
                    messages[response.status] ||
                    "The request could not be completed.";
                if (publicRequest && response.status === 401)
                    message = "Sign-in failed. Check your email and password.";
                if (response.status === 400 && Array.isArray(data?.errors)) {
                    const labels = {
                        fname: "First name",
                        lname: "Last name",
                        email: "Email",
                        password: "Password",
                        passwordConfirmation: "Password confirmation",
                        facilityId: "Facility",
                        purpose: "Purpose",
                        startDatetime: "Start time",
                        endDatetime: "End time",
                        body: "Request",
                    };
                    const codes = {
                        INVALID_NAME: "must contain 1 to 60 valid characters",
                        INVALID_EMAIL:
                            "must be a valid address of at most 150 characters",
                        PASSWORD_POLICY:
                            "must be a unique passphrase of 15 or more characters, at most 72 UTF-8 bytes, without control characters",
                        PASSWORD_MISMATCH: "must match the password",
                        REQUIRED: "is required",
                        INVALID_FACILITY_ID: "must be a positive integer",
                        INVALID_PURPOSE: "must contain valid text",
                        PURPOSE_TOO_LONG: "must be at most 255 characters",
                        INVALID_TIMESTAMP:
                            "must be a valid timezone-aware time",
                        TIMESTAMP_PRECISION: "supports milliseconds only",
                        TIMESTAMP_RANGE: "is outside the supported range",
                        INVALID_TIME_ORDER: "must be after the start time",
                        UNEXPECTED_FIELDS: "contains unsupported fields",
                        INVALID_PAYLOAD: "has an invalid format",
                    };
                    const safe = data.errors
                        .filter(
                            (e) =>
                                e &&
                                typeof e.field === "string" &&
                                typeof e.code === "string" &&
                                Object.hasOwn(labels, e.field) &&
                                Object.hasOwn(codes, e.code),
                        )
                        .map((e) => `${labels[e.field]} ${codes[e.code]}.`);
                    if (safe.length) message = safe.join(" ");
                }
                throw new ApiError(
                    response.status,
                    response.status >= 500 && reservationWrite
                        ? "The server couldn't confirm this reservation action. Refresh Reservations and check whether it went through before trying again. Contact your administrator if the error continues."
                        : reservationCode === "RESERVATION_CONFLICT"
                          ? "The transaction conflicted or its outcome needs verification. Refresh and check your request history before resubmitting."
                          : message,
                    method !== "GET" &&
                        (response.status === 409 || response.status >= 500) &&
                        reservationCode !== "RESERVATION_SCHEDULE_CONFLICT",
                    reservationCode,
                );
            }
            return data;
        },
    };
}
export function toInstant(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    )
        throw new Error("Choose a valid local date and time.");
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, "0");
    if (
        !Number.isFinite(date.getTime()) ||
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` !==
            value
    )
        throw new Error("Choose a valid local date and time.");
    return date.toISOString();
}
