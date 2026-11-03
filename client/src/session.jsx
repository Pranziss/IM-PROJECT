import React, {
    createContext,
    useContext,
    useMemo,
    useState,
    useEffect,
} from "react";
import { createApi } from "./api";
export const roles = [
    "System Administrator",
    "Facility/Maintenance Staff",
    "Faculty / Student Organization Representative",
];
// Renew the 15-minute access token this long before it expires.
const RENEW_BEFORE_MS = 60 * 1000;
const Context = createContext(null);
export function SessionProvider({ children, apiFactory = createApi }) {
    const [user, setUser] = useState(null),
        [expires, setExpires] = useState(null),
        [notice, setNotice] = useState(""),
        [restoring, setRestoring] = useState(true);
    const api = useMemo(
        () =>
            apiFactory({
                onUnauthorized: () => {
                    api.setToken(null);
                    setUser(null);
                    setExpires(null);
                    setNotice("Your session expired. Please sign in again.");
                },
            }),
        [apiFactory],
    );
    const expiry = (seconds) =>
        Date.now() + Math.min(Number(seconds) || 900, 900) * 1000;
    // Ask the server for a new access token using the httpOnly refresh cookie.
    async function refresh() {
        const data = await api.request("/auth/refresh", {
            method: "POST",
            publicRequest: true,
            withCredentials: true,
        });
        if (
            typeof data.token !== "string" ||
            !data.token ||
            !roles.includes(data.user?.role?.roleName)
        )
            throw Error("Unable to restore the session.");
        return data;
    }
    const logout = () => {
        api.request("/auth/logout", {
            method: "POST",
            publicRequest: true,
            withCredentials: true,
        }).catch(() => {
            /* The local session is cleared even if the server is unreachable. */
        });
        api.setToken(null);
        setUser(null);
        setExpires(null);
        setNotice("You have signed out.");
    };
    // Restore the session after a page reload or reopened tab.
    useEffect(() => {
        let active = true;
        refresh()
            .then((data) => {
                if (!active) return;
                api.setToken(data.token);
                setUser(data.user);
                setExpires(expiry(data.expiresIn));
            })
            .catch(() => {
                /* No valid refresh cookie: show the sign-in page. */
            })
            .finally(() => {
                if (active) setRestoring(false);
            });
        return () => {
            active = false;
        };
    }, [api]);
    // Silently renew the access token shortly before it expires.
    useEffect(() => {
        if (!expires) return;
        let active = true;
        const timer = setTimeout(
            () => {
                refresh()
                    .then((data) => {
                        if (!active) return;
                        api.renewToken(data.token);
                        setExpires(expiry(data.expiresIn));
                    })
                    .catch(() => {
                        if (!active) return;
                        api.setToken(null);
                        setUser(null);
                        setExpires(null);
                        setNotice(
                            "Your session expired. Please sign in again.",
                        );
                    });
            },
            Math.max(0, expires - Date.now() - RENEW_BEFORE_MS),
        );
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [api, expires]);
    async function login(email, password) {
        const data = await api.request("/auth/login", {
            method: "POST",
            body: { email, password },
            publicRequest: true,
            withCredentials: true,
        });
        if (typeof data.token !== "string" || !data.token)
            throw Error("Unable to establish a session.");
        api.setToken(data.token);
        try {
            const profile = await api.request("/auth/me");
            if (!roles.includes(profile.user?.role?.roleName))
                throw Error("Your role cannot access this application.");
            setUser(profile.user);
            setExpires(expiry(data.expiresIn));
            setNotice("");
        } catch (error) {
            api.setToken(null);
            throw error;
        }
    }
    return (
        <Context.Provider
            value={{ user, api, login, logout, notice, restoring }}
        >
            {children}
        </Context.Provider>
    );
}
export function useSession() {
    return useContext(Context);
}
