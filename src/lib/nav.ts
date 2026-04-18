import {
  IconBallAmericanFootball,
  IconBook2,
  IconCalendar,
  IconMap,
  IconMessageCircle,
  IconTools,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

export type NavItem = {
  href: string;
  icon: TablerIcon;
  label: string;
};

// Always visible to every signed-in user. The Chats tab is the
// management surface (search, star, archive, rename); the "+ New chat"
// button and the logo link still start a new conversation.
export const MAIN_NAV_ITEMS = [
  { href: "/chats", icon: IconMessageCircle, label: "Chats" },
  { href: "/calendar", icon: IconCalendar, label: "Calendar" },
  { href: "/gallery", icon: IconBook2, label: "Gallery" },
] as const satisfies readonly NavItem[];

// Collapsible "Apps" section — mini-apps built over time. Visible to
// everyone (the pages themselves handle access gating internally).
export const APP_NAV_ITEMS = [
  { href: "/fantasy", icon: IconBallAmericanFootball, label: "MLF" },
  { href: "/trips", icon: IconMap, label: "World Tour" },
] as const satisfies readonly NavItem[];

// Admin-only — only shown when the user has role=ADMIN.
export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  icon: IconTools,
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
