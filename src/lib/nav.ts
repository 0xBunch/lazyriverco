import {
  IconBallAmericanFootball,
  IconBook2,
  IconBuildingStadium,
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
// `/sports` is a top-level dashboard parent — individual sports apps
// (MLF fantasy football, future NBA/MLB modules) sit UNDER /sports/*
// rather than as siblings in the nav so the Apps section stays tight.
export const MAIN_NAV_ITEMS = [
  { href: "/chats", icon: IconMessageCircle, label: "Chats" },
  { href: "/calendar", icon: IconCalendar, label: "Calendar" },
  { href: "/library", icon: IconBook2, label: "Library" },
  { href: "/sports", icon: IconBuildingStadium, label: "Sports" },
] as const satisfies readonly NavItem[];

// Collapsible "Apps" section — mini-apps built over time. Visible to
// everyone (the pages themselves handle access gating internally).
export const APP_NAV_ITEMS = [
  { href: "/trips", icon: IconMap, label: "World Tour" },
] as const satisfies readonly NavItem[];

// Icon used on the /sports dashboard card for each sport. Kept next to
// the nav table so new sport modules get a consistent visual anchor.
export { IconBallAmericanFootball as IconMLF };

// Admin-only — only shown when the user has role=ADMIN.
export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  icon: IconTools,
  label: "Control Panel",
};

export type NavHref =
  | (typeof MAIN_NAV_ITEMS)[number]["href"]
  | (typeof APP_NAV_ITEMS)[number]["href"];

/**
 * Gate for admin-only surfaces (Control Panel). Kept separate
 * from the app nav so non-admins can see the Apps section but not
 * the admin tools.
 */
export function canSeeMiniApps(
  user: { role: "MEMBER" | "ADMIN" } | null | undefined,
): boolean {
  if (!user) return false;
  return user.role === "ADMIN";
}
