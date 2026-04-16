export type NavItem = {
  href: string;
  icon: string;
  label: string;
};

// Always visible to every signed-in user. Chat is accessed via the
// "+ New chat" button and the logo link — no dedicated nav item needed.
export const MAIN_NAV_ITEMS = [
  { href: "/calendar", icon: "📅", label: "Calendar" },
  { href: "/media", icon: "📸", label: "Media" },
] as const satisfies readonly NavItem[];

// Collapsible "Apps" section — mini-apps built over time. Visible to
// everyone (the pages themselves handle access gating internally).
export const APP_NAV_ITEMS = [
  { href: "/fantasy", icon: "🏈", label: "MLF" },
  { href: "/trips", icon: "🗺️", label: "World Tour" },
] as const satisfies readonly NavItem[];

// Admin-only — only shown when the user has role=ADMIN.
export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  icon: "🛠️",
  label: "Commissioner",
};

export type NavHref =
  | (typeof MAIN_NAV_ITEMS)[number]["href"]
  | (typeof APP_NAV_ITEMS)[number]["href"];

/**
 * Gate for admin-only surfaces (Commissioner Room). Kept separate
 * from the app nav so non-admins can see the Apps section but not
 * the admin tools.
 */
export function canSeeMiniApps(
  user: { role: "MEMBER" | "ADMIN" } | null | undefined,
): boolean {
  if (!user) return false;
  return user.role === "ADMIN";
}
