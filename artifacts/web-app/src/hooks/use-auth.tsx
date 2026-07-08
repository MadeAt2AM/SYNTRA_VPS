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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth_token"));
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: user, isLoading } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 0,
    }
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
    }
  }, [token]);

  const login = (newToken: string, mustChangePassword?: boolean) => {
    // Set localStorage immediately so API calls can read the token before the effect fires
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    if (mustChangePassword) {
      localStorage.setItem("must_change_password", "1");
    } else {
      localStorage.removeItem("must_change_password");
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("must_change_password");
    queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    navigate("/login");
  };

  const isAuthLoading = !!token && isLoading;
  const isAuthenticated = !!token && !!user;

  const enrichedUser = user ? {
    ...user,
    mustChangePassword: (user as any).mustChangePassword ?? localStorage.getItem("must_change_password") === "1",
  } : null;

  return (
    <AuthContext.Provider value={{
      user: enrichedUser,
      isLoading: isAuthLoading,
      login,
      logout,
      isAuthenticated,
    }}>
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
