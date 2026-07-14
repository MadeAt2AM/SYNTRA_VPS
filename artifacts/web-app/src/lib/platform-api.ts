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
  customDomain?: string | null;
  domainStatus?: string;
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

export interface PlatformCompanyUser {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface PlatformCompanyDetail extends PlatformCompany {
  address?: string | null;
  phone?: string | null;
  timezone?: string;
  weekStartDay?: number;
  overtimeThreshold?: string;
  domainVerifiedAt?: string | null;
  users: PlatformCompanyUser[];
}

export function usePlatformCompany(id: number | null) {
  return useQuery({
    queryKey: ['platform', 'companies', id],
    queryFn: () => fetchPlatform<PlatformCompanyDetail>(`/api/platform/companies/${id}`),
    enabled: id !== null,
  });
}

export function usePlatformImpersonate() {
  return useMutation({
    mutationFn: (userId: number) =>
      fetchPlatform<{ token: string; userId: number; role: string; companyId: number | null }>(
        `/api/platform/impersonate/${userId}`,
        { method: 'POST' },
      ),
  });
}

export interface UpdateCompanyPayload {
  name?: string;
  status?: string;
  plan?: string;
  timezone?: string;
  address?: string | null;
  phone?: string | null;
  overtimeThreshold?: string;
  weekStartDay?: number;
  customDomain?: string | null;
}

export function usePlatformUpdateCompany() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCompanyPayload }) =>
      fetchPlatform<PlatformCompanyDetail>(`/api/platform/companies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  });
}

export interface DomainVerifyResult {
  id: number;
  customDomain: string | null;
  domainStatus: string;
  domainVerifiedAt: string | null;
  checkDetail: string;
  method: string;
}

export function usePlatformVerifyDomain() {
  return useMutation({
    mutationFn: (companyId: number) =>
      fetchPlatform<DomainVerifyResult>(`/api/platform/companies/${companyId}/domain/verify`, { method: 'POST' }),
  });
}

export interface DomainDnsInstructions {
  customDomain: string | null;
  domainStatus: string;
  recordType: string;
  target: string | null;
  allTargets: string[];
}

export function usePlatformDomainInstructions(companyId: number | null) {
  return useQuery({
    queryKey: ['platform', 'companies', companyId, 'domain-instructions'],
    queryFn: () => fetchPlatform<DomainDnsInstructions>(`/api/platform/companies/${companyId}/domain/dns-instructions`),
    enabled: companyId !== null,
  });
}

export function usePlatformAddAdmin() {
  return useMutation({
    mutationFn: ({ companyId, data }: { companyId: number; data: { name: string; email: string; tempPassword: string } }) =>
      fetchPlatform<{ id: number; email: string; name: string; role: string; mustChangePassword: boolean }>(
        `/api/platform/companies/${companyId}/admins`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
  });
}

// ─── Platform-admin accounts ───────────────────────────────────────────────

export interface PlatformAdminUser {
  id: number;
  email: string;
  name: string;
  status: string;
  createdAt: string;
}

export function usePlatformAdmins() {
  return useQuery({
    queryKey: ['platform', 'admins'],
    queryFn: () => fetchPlatform<PlatformAdminUser[]>('/api/platform/admins'),
  });
}

export function usePlatformAddPlatformAdmin() {
  return useMutation({
    mutationFn: (data: { name: string; email: string; tempPassword: string }) =>
      fetchPlatform<{ id: number; email: string; name: string; role: string; mustChangePassword: boolean }>(
        `/api/platform/admins`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
  });
}

// ─── Platform-wide settings (site contact form SMTP) ───────────────────────

export interface PlatformSmtpSanitized {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  configured: true;
}

export interface PlatformSettings {
  smtp: PlatformSmtpSanitized | null;
  contactEmailTo: string | null;
  contactEmailFrom: string | null;
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform', 'settings'],
    queryFn: () => fetchPlatform<PlatformSettings>('/api/platform/settings'),
  });
}

export interface SavePlatformSmtpPayload {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function usePlatformSaveSettings() {
  return useMutation({
    mutationFn: (data: { smtp?: SavePlatformSmtpPayload | null; contactEmailTo?: string | null; contactEmailFrom?: string | null }) =>
      fetchPlatform<PlatformSettings>('/api/platform/settings', { method: 'PUT', body: JSON.stringify(data) }),
  });
}

export function usePlatformTestSmtp() {
  return useMutation({
    mutationFn: (data: SavePlatformSmtpPayload) =>
      fetchPlatform<{ success: boolean; message: string }>('/api/platform/settings/test-smtp', { method: 'POST', body: JSON.stringify(data) }),
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
