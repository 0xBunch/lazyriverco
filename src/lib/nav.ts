export type NavItem = {
  href: string;
  icon: string;
  label: string;
};

export const NAV_ITEMS = [
  { href: "/chat", icon: "💬", label: "Chat" },
  { href: "/fantasy", icon: "🏈", label: "Fantasy" },
  { href: "/picks", icon: "🎰", label: "Picks" },
  { href: "/brackets", icon: "🏆", label: "Brackets" },
  { href: "/media", icon: "📸", label: "Media" },
  { href: "/trips", icon: "🗺️", label: "Trips" },
  { href: "/leaderboard", icon: "📊", label: "Leaderboard" },
  { href: "/games", icon: "🎮", label: "Games" },
  { href: "/calendar", icon: "📅", label: "Calendar" },
] as const satisfies readonly NavItem[];

/// Admin-only — appended to NAV_ITEMS when the current user has role=ADMIN.
/// Server-side filtering in Sidebar.tsx keeps this off member screens.
export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  icon: "🛠️",
  label: "Commissioner",
};

export type NavHref = (typeof NAV_ITEMS)[number]["href"];

/**
 * Gate for mini-app tabs (fantasy / picks / brackets / trips / etc.).
 * Phase 1: mini-app tabs are hidden from members; only the commissioner
 * (ADMIN role) sees them. When phase 2 opens tabs up to the whole crew,
 * split this from the admin-surface check and keep ADMIN_NAV_ITEM gated
 * on role separately.
 *
 * User type kept inline so this module stays client-safe — nav.ts is
 * imported by both server components (Sidebar) and client components
 * (SidebarNav). Importing SafeUser from auth.ts would pull in the
 * "server-only" marker and break the client bundle.
 */
export function canSeeMiniApps(
  user: { role: "MEMBER" | "ADMIN" } | null | undefined,
): boolean {
  if (!user) return false;
  return user.role === "ADMIN";
}
