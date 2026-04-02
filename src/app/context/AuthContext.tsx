import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  roleId?: number;
  role: string;
  allowedPaths: string[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem("authToken");
    return localStorage.getItem("isAuthenticated") === "true" && !!token;
  });
  const [user, setUser] = useState<AuthUser | null>(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) {
      return null;
    }

    try {
      const parsed = JSON.parse(savedUser);
      if (typeof parsed?.username !== "string") {
        return null;
      }

      return {
        id: Number(parsed?.id || 0),
        username: parsed.username,
        displayName: typeof parsed?.displayName === "string" && parsed.displayName.trim() !== "" ? parsed.displayName : parsed.username,
        roleId: Number(parsed?.roleId || 0),
        role: typeof parsed?.role === "string" ? parsed.role : "vendedor",
        allowedPaths: Array.isArray(parsed?.allowedPaths)
          ? parsed.allowedPaths.map((value: unknown) => String(value || "")).filter((value: string) => value !== "")
          : [],
      };
    } catch {
      return null;
    }
  });

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          message: typeof payload?.error === "string" ? payload.error : "Credenciales incorrectas",
        };
      }

      const userData = {
        id: Number(payload?.id || 0),
        username: String(payload?.username || username),
        displayName: String(payload?.displayName || payload?.username || username),
        roleId: Number(payload?.roleId || 0),
        role: String(payload?.role || "vendedor"),
        allowedPaths: Array.isArray(payload?.allowedPaths)
          ? payload.allowedPaths.map((value: unknown) => String(value || "")).filter((value: string) => value !== "")
          : [],
      };

      const token = String(payload?.token || "").trim();
      if (!token) {
        return {
          success: false,
          message: "No se recibió token de autenticación",
        };
      }

      setIsAuthenticated(true);
      setUser(userData);
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("authToken", token);

      return { success: true };
    } catch {
      return {
        success: false,
        message: "No se pudo conectar al servidor",
      };
    }
  };

  const refreshSession = async () => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      logout();
      return;
    }

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        logout();
        return;
      }

      if (!response.ok) {
        return;
      }

      const payload = await response.json().catch(() => ({}));

      const refreshedUser: AuthUser = {
        id: Number(payload?.id || user.id),
        username: String(payload?.username || user.username),
        displayName: String(payload?.displayName || user.displayName || user.username),
        roleId: Number(payload?.roleId || user.roleId || 0),
        role: String(payload?.role || user.role || "vendedor"),
        allowedPaths: Array.isArray(payload?.allowedPaths)
          ? payload.allowedPaths.map((value: unknown) => String(value || "")).filter((value: string) => value !== "")
          : user.allowedPaths,
      };

      const hasChanges =
        refreshedUser.username !== user.username ||
        refreshedUser.displayName !== user.displayName ||
        refreshedUser.role !== user.role ||
        Number(refreshedUser.roleId || 0) !== Number(user.roleId || 0) ||
        JSON.stringify(refreshedUser.allowedPaths) !== JSON.stringify(user.allowedPaths);

      if (hasChanges) {
        setUser(refreshedUser);
        localStorage.setItem("user", JSON.stringify(refreshedUser));
      }
    } catch {
      // Ignore transient errors while keeping session active
    }
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        return originalFetch(input, init);
      }

      const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : String(input.url || "");
      const targetUrl = new URL(rawUrl, window.location.origin);
      const shouldAttachToken =
        targetUrl.origin === window.location.origin && targetUrl.pathname.startsWith("/api/");

      if (!shouldAttachToken) {
        return originalFetch(input, init);
      }

      const requestHeaders =
        typeof input === "object" && input instanceof Request ? input.headers : undefined;
      const headers = new Headers(init?.headers || requestHeaders);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      return originalFetch(input, {
        ...init,
        headers,
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    const needsDisplayNameHydration =
      !user.displayName ||
      user.displayName.trim() === "" ||
      user.displayName.trim().toLowerCase() === user.username.trim().toLowerCase();

    if (!needsDisplayNameHydration) {
      return;
    }

    const hydrateDisplayName = async () => {
      try {
        const response = await fetch(`/api/auth/users/${user.id}`);
        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => ({}));
        const nombres = String(payload?.nombres || "").trim();
        const apellidos = String(payload?.apellidos || "").trim();
        const fullName = `${nombres} ${apellidos}`.trim();

        if (!fullName) {
          return;
        }

        const updatedUser = {
          ...user,
          displayName: fullName,
        };

        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
      } catch {
        // ignore hydration errors
      }
    };

    hydrateDisplayName();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    const runRefresh = () => {
      refreshSession();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };

    runRefresh();
    const intervalId = window.setInterval(runRefresh, 60000);
    window.addEventListener("focus", runRefresh);
    window.addEventListener("role-permissions:changed", runRefresh as EventListener);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runRefresh);
      window.removeEventListener("role-permissions:changed", runRefresh as EventListener);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, user?.id, user?.role, user?.allowedPaths]);

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, refreshSession, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
