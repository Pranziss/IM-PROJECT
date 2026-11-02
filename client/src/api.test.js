import { test, expect, vi } from "vitest";
import { createApi, toInstant } from "./api";
const response = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
});
test("bearer tokens stay in memory and requests use same-origin headers without cookies", async () => {
    const fetchImpl = vi.fn(async () => response(200, { success: true }));
    const api = createApi({ fetchImpl });
    api.setToken("synthetic-token");
    await api.request("/loans");
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/loans");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer synthetic-token",
    );
    expect(fetchImpl.mock.calls[0][1].credentials).toBe("omit");
    api.setToken(null);
    await api.request("/loans");
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
});
test.each([400, 401, 403, 404, 409, 413, 415, 500, 503])(
    "HTTP %i errors never display private server diagnostics or retry",
    async (status) => {
        const onUnauthorized = vi.fn(),
            fetchImpl = vi.fn(async () =>
                response(status, {
                    success: false,
                    message: "PRIVATE-fixture-sql-secret",
                    details: "PRIVATE-fixture",
                }),
            );
        const api = createApi({ fetchImpl, onUnauthorized });
        await expect(
            api.request("/loans", { method: "POST", body: {} }),
        ).rejects.toMatchObject({ status });
        try {
            await api.request("/loans");
        } catch (error) {
            expect(error.message).not.toContain("PRIVATE");
        }
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 2 : 0);
    },
);
test("login failure stays generic without treating credentials as a lost business write", async () => {
    const onUnauthorized = vi.fn(),
        api = createApi({
            onUnauthorized,
            fetchImpl: async () =>
                response(401, { success: false, message: "PRIVATE" }),
        });
    await expect(
        api.request("/auth/login", {
            method: "POST",
            body: {},
            publicRequest: true,
        }),
    ).rejects.toThrow(/Sign-in failed/);
    expect(onUnauthorized).not.toHaveBeenCalled();
});
test("structured errors use only known labels and codes", async () => {
    const api = createApi({
        fetchImpl: async () =>
            response(400, {
                success: false,
                errors: [
                    null,
                    { field: "PRIVATE", code: "PRIVATE" },
                    { field: "purpose", code: "PURPOSE_TOO_LONG" },
                ],
            }),
    });
    await expect(
        api.request("/reservations", { method: "POST", body: {} }),
    ).rejects.toThrow("Purpose must be at most 255 characters.");
});
test("reservation server errors tell users to check history before retrying", async () => {
    const api = createApi({
        fetchImpl: async () =>
            response(500, {
                success: false,
                message: "PRIVATE database diagnostics",
            }),
    });
    await expect(
        api.request("/reservations", { method: "POST", body: {} }),
    ).rejects.toMatchObject({
        status: 500,
        requiresRefresh: true,
        message:
            "The server couldn't confirm this reservation action. Refresh Reservations and check whether it went through before trying again. Contact your administrator if the error continues.",
    });
});
test("stale requests cannot return another session data or log out a new session", async () => {
    let resolve;
    const onUnauthorized = vi.fn(),
        api = createApi({
            onUnauthorized,
            fetchImpl: () =>
                new Promise((done) => {
                    resolve = done;
                }),
        });
    api.setToken("synthetic-first");
    const pending = api.request("/loans");
    api.setToken("synthetic-second");
    resolve(response(401, { success: false }));
    await expect(pending).rejects.toThrow("Session changed");
    expect(onUnauthorized).not.toHaveBeenCalled();
});
test("lost write responses require reconciliation and never expose network details", async () => {
    const fetchImpl = vi.fn(async () => {
        throw Error("PRIVATE-connection-fixture");
    });
    const api = createApi({ fetchImpl });
    await expect(
        api.request("/loans", { method: "POST", body: {} }),
    ).rejects.toMatchObject({ requiresRefresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test("local time conversion preserves the intended instant and rejects rollover dates", () => {
    const value = "2028-02-29T10:00";
    expect(toInstant(value)).toBe(new Date(value).toISOString());
    for (const invalid of [
        "2027-02-29T10:00",
        "2028-02-30T10:00",
        "malformed",
        "2028-01-01T24:00",
    ])
        expect(() => toInstant(invalid)).toThrow();
});
