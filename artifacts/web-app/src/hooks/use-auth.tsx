import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string) => void;
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
      // Do not keep stale data when query is disabled (token removed)
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

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = () => {
    // 1. Remove the token from state and localStorage
    setToken(null);
    // 2. Immediately evict the /me cache so guards see no user
    queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    // 3. Force navigation to login
    navigate("/login");
  };

  // Auth is loading only when we have a token and are still fetching
  const isAuthLoading = !!token && isLoading;
  // isAuthenticated requires both a token AND a successfully fetched user
  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
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
