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

export type NavHref = (typeof NAV_ITEMS)[number]["href"];
