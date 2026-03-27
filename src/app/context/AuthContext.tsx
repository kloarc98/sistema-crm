import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  allowedPaths: string[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check if user was previously logged in
    return localStorage.getItem("isAuthenticated") === "true";
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
        role: String(payload?.role || "vendedor"),
        allowedPaths: Array.isArray(payload?.allowedPaths)
          ? payload.allowedPaths.map((value: unknown) => String(value || "")).filter((value: string) => value !== "")
          : [],
      };

      setIsAuthenticated(true);
      setUser(userData);
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("user", JSON.stringify(userData));

      return { success: true };
    } catch {
      return {
        success: false,
        message: "No se pudo conectar al servidor",
      };
    }
  };

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

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, user }}>
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
