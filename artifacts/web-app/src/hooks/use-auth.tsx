import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: (UserProfile & { mustChangePassword?: boolean }) | null;
  isLoading: boolean;
  login: (token: string, mustChangePassword?: boolean) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Read the persisted auth token on first mount. Guarded with try/catch so
 * that Safari Private Mode / cookie-disabled browsers / extensions that
 * throw on localStorage access don't crash the entire app.
 */
function readToken(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken());
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 0,
      // 6s timeout: if /api/auth/me doesn't resolve by then, fall through to
      // the public landing page rather than spinning forever.
      // (TanStack Query doesn't have a built-in timeout, so the API client
      // handles this — we just enforce a sensible fallback below.)
    },
  });

  // Auto-clear stale tokens on 401. A token issued before the last JWT
  // secret rotation would loop the spinner forever; this catches that case.
  useEffect(() => {
    if (token && error && !isLoading) {
      // Stale token — wipe it so the user lands on the public page instead
      // of staring at a spinner.
      try {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("must_change_password");
      } catch {
        // ignore
      }
      setToken(null);
      queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    }
  }, [token, error, isLoading, queryClient]);

  useEffect(() => {
    if (token) {
      try {
        localStorage.setItem("auth_token", token);
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem("auth_token");
      } catch {
        // ignore
      }
    }
  }, [token]);

  const login = (newToken: string, mustChangePassword?: boolean) => {
    // Set localStorage immediately so API calls can read the token before the effect fires
    try {
      localStorage.setItem("auth_token", newToken);
    } catch {
      // ignore
    }
    setToken(newToken);
    if (mustChangePassword) {
      try {
        localStorage.setItem("must_change_password", "1");
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem("must_change_password");
      } catch {
        // ignore
      }
    }
  };

  const logout = () => {
    setToken(null);
    try {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("must_change_password");
    } catch {
      // ignore
    }
    queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    navigate("/login");
  };

  const isAuthLoading = !!token && isLoading;
  const isAuthenticated = !!token && !!user;

  const enrichedUser = user
    ? {
        ...user,
        mustChangePassword:
          (user as any).mustChangePassword ??
          (() => {
            try {
              return localStorage.getItem("must_change_password") === "1";
            } catch {
              return false;
            }
          })(),
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user: enrichedUser,
        isLoading: isAuthLoading,
        login,
        logout,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}