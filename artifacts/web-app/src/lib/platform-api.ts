import { useQuery, useMutation } from "@tanstack/react-query";

async function fetchPlatform<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  const res = await fetch(endpoint, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Platform API error"), { data: body, status: res.status });
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

export interface CreateCompanyResult {
  company: PlatformCompany;
  owner: {
    id: number;
    email: string;
    name: string;
    role: string;
    mustChangePassword: boolean;
  };
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ['platform', 'stats'],
    queryFn: () => fetchPlatform<any>('/api/platform/stats').then(d => ({
      totalCompanies: d.companies?.total ?? 0,
      activeCompanies: d.companies?.active ?? 0,
      totalUsers: d.users?.total ?? 0,
    })),
  });
}

export function usePlatformCompanies() {
  return useQuery({
    queryKey: ['platform', 'companies'],
    queryFn: () => fetchPlatform<PlatformCompany[]>('/api/platform/companies'),
  });
}

export function usePlatformCreateCompany() {
  return useMutation({
    mutationFn: (data: { name: string; ownerName: string; ownerEmail: string; ownerTempPassword: string; plan: string }) =>
      fetchPlatform<CreateCompanyResult>('/api/platform/companies', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export async function apiChangePassword(currentPassword: string | undefined, newPassword: string) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Failed"), { data: body });
  }
  return res.json();
}

export async function apiSaveSmtp(companyId: number, data: object) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/companies/${companyId}/smtp`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Failed to save SMTP"), { data: body });
  }
  return res.json();
}

export async function apiTestSmtp(companyId: number, data: object) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/companies/${companyId}/smtp/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function apiCheckLeave(employeeId: number, date: string) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/shifts/leave-check?employeeId=${employeeId}&date=${date}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return { hasConflict: false, hasPending: false };
  return res.json();
}
