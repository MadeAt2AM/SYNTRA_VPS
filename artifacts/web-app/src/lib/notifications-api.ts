const BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("API error"), { data: body, status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface AppNotification {
  id: number;
  companyId: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  data: any;
  readAt: string | null;
  createdAt: string;
}

export function listNotifications(): Promise<AppNotification[]> {
  return apiFetch("/notifications");
}

export function markNotificationRead(id: number): Promise<AppNotification> {
  return apiFetch(`/notifications/${id}/read`, { method: "PUT" });
}

export function markAllNotificationsRead(): Promise<{ success: boolean }> {
  return apiFetch("/notifications/read-all", { method: "PUT" });
}

// Shift swaps
export interface ShiftSwap {
  id: number;
  companyId: number;
  requesterId: number;
  requesterShiftId: number;
  targetEmployeeId: number;
  targetShiftId: number;
  status: string;
  token: string;
  expiresAt: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export function listShiftSwaps(): Promise<ShiftSwap[]> {
  return apiFetch("/shift-swaps");
}

export function requestShiftSwap(myShiftId: number, targetShiftId: number): Promise<ShiftSwap> {
  return apiFetch("/shift-swaps", {
    method: "POST",
    body: JSON.stringify({ myShiftId, targetShiftId }),
  });
}

export function respondToSwap(swapId: number, action: "accept" | "reject"): Promise<ShiftSwap> {
  return apiFetch(`/shift-swaps/${swapId}/respond`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

// Shift offers
export interface ShiftOffer {
  id: number;
  companyId: number;
  shiftId: number;
  offeredBy: number;
  status: string;
  takenBy: number | null;
  takenAt: string | null;
  createdAt: string;
}

export function listShiftOffers(): Promise<ShiftOffer[]> {
  return apiFetch("/shift-offers");
}

export function offerShift(shiftId: number): Promise<ShiftOffer> {
  return apiFetch("/shift-offers", {
    method: "POST",
    body: JSON.stringify({ shiftId }),
  });
}

export function takeShiftOffer(offerId: number): Promise<{ success: boolean }> {
  return apiFetch(`/shift-offers/${offerId}/take`, { method: "POST" });
}

export function retractShiftOffer(offerId: number): Promise<void> {
  return apiFetch(`/shift-offers/${offerId}`, { method: "DELETE" });
}

// Shift replacements — one-directional: requester picks a specific colleague to cover their shift
export interface ShiftReplacement {
  id: number;
  companyId: number;
  shiftId: number;
  requestedBy: number;
  targetEmployeeId: number;
  status: string;
  token: string;
  expiresAt: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export function listShiftReplacements(): Promise<ShiftReplacement[]> {
  return apiFetch("/shift-replacements");
}

export function requestShiftReplacement(shiftId: number, targetEmployeeId: number): Promise<ShiftReplacement> {
  return apiFetch("/shift-replacements", {
    method: "POST",
    body: JSON.stringify({ shiftId, targetEmployeeId }),
  });
}

export function respondToReplacement(replacementId: number, action: "accept" | "reject"): Promise<ShiftReplacement> {
  return apiFetch(`/shift-replacements/${replacementId}/respond`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function cancelShiftReplacement(replacementId: number): Promise<void> {
  return apiFetch(`/shift-replacements/${replacementId}`, { method: "DELETE" });
}

// Shift suggestions
export function suggestShifts(weekStart: string): Promise<{ inserted: number; suggestions: any[] }> {
  return apiFetch("/shifts/suggest", {
    method: "POST",
    body: JSON.stringify({ weekStart }),
  });
}

export function approveSuggestions(weekStart: string, publish: boolean = true): Promise<{ approved: number }> {
  return apiFetch("/shifts/approve-suggestions", {
    method: "POST",
    body: JSON.stringify({ weekStart, publish }),
  });
}

// Claim an unassigned open shift directly (no offer needed)
export function claimShift(shiftId: number): Promise<{ success: boolean }> {
  return apiFetch(`/shifts/${shiftId}/claim`, { method: "POST" });
}
