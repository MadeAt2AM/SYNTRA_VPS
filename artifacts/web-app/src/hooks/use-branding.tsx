import { useQuery } from "@tanstack/react-query";

export interface BrandingInfo {
  branded: boolean;
  companyId?: number;
  name?: string;
  logoUrl?: string | null;
  logoText?: string | null;
}

/**
 * Looks up whether the current hostname is a verified company custom domain.
 * Used on public pages (login, forgot-password) to show the company's own
 * branding instead of generic SYNTRA branding when visitors arrive via
 * their employer's custom domain.
 */
export function useBranding() {
  return useQuery<BrandingInfo>({
    queryKey: ["public", "branding", window.location.hostname],
    queryFn: async () => {
      const res = await fetch(`/api/public/branding`);
      if (!res.ok) return { branded: false };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
