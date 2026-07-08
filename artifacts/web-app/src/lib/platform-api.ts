import { useQuery, useMutation } from "@tanstack/react-query";

async function fetchPlatform<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers = new Headers(options?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  const res = await fetch(endpoint, { ...options, headers });
  if (!res.ok) {
    throw new Error("Platform API error");
  }
  return res.json();
}

export interface PlatformStats {
  totalCompanies: number;
  totalUsers: number;
  activeCompanies: number;
}

export interface PlatformCompany {
  id: number;
  name: string;
  status: string;
  plan: string;
  createdAt: string;
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ['platform', 'stats'],
    queryFn: () => fetchPlatform<PlatformStats>('/api/platform/stats')
  });
}

export function usePlatformCompanies() {
  return useQuery({
    queryKey: ['platform', 'companies'],
    queryFn: () => fetchPlatform<PlatformCompany[]>('/api/platform/companies')
  });
}

export function usePlatformCreateCompany() {
  return useMutation({
    mutationFn: (data: { name: string, plan: string }) => 
      fetchPlatform<PlatformCompany>('/api/platform/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
  });
}
