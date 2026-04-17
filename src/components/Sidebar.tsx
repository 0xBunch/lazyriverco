import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LazyRiverLogo } from "@/components/LazyRiverLogo";
import { SidebarNav } from "@/components/SidebarNav";
import { ConversationSidebarList } from "@/components/ConversationSidebarList";
import { StarredSidebarList } from "@/components/StarredSidebarList";
import {
  ADMIN_NAV_ITEM,
  MAIN_NAV_ITEMS,
  APP_NAV_ITEMS,
  type NavItem,
} from "@/lib/nav";

function initials(displayName: string): string {
  const [first, second] = displayName.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export async function Sidebar() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const mainNav: readonly NavItem[] = isAdmin
    ? [...MAIN_NAV_ITEMS, ADMIN_NAV_ITEM]
    : MAIN_NAV_ITEMS;

  return (
    <div className="flex h-full flex-col">
      {/* Logo — wordmark when expanded, hidden when collapsed
          (the toggle button replaces it visually at the top).
          SVG uses currentColor so text-* drives fill — light on
          dark here, dark on light when placed on light surfaces. */}
      <Link
        href="/"
        className="block px-5 pb-2 pt-4 transition-opacity hover:opacity-80 group-data-[collapsed]:hidden"
        aria-label="The Lazy River Co. — home"
      >
        <LazyRiverLogo className="w-36 text-bone-50" />
      </Link>

      {/* New chat CTA — full button expanded, icon-only collapsed */}
      {user ? (
        <div className="px-3 pb-1 pt-2 group-data-[collapsed]:px-1 group-data-[collapsed]:pt-1">
          <Link
            href="/"
            title="New chat"
            className="flex items-center justify-center gap-2 rounded-lg border border-bone-700 bg-bone-800 px-3 py-2 text-xs font-medium text-bone-100 transition-colors hover:border-claude-500/60 hover:text-claude-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950 group-data-[collapsed]:border-0 group-data-[collapsed]:bg-transparent group-data-[collapsed]:px-0 group-data-[collapsed]:py-1.5"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="hidden h-5 w-5 group-data-[collapsed]:block"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="group-data-[collapsed]:hidden">+ New chat</span>
          </Link>
        </div>
      ) : null}

      {/* Main nav */}
      <SidebarNav items={mainNav} />

      {/* Starred + Recents — both sections scroll together inside a single
          lane so the total footprint adapts to how many pins the user has.
          Starred renders nothing when empty (no orphaned header). The
          Recents label is always present as long as the user has any
          conversations. Collapsed-sidebar hides the whole stack. */}
      {user ? (
        <div className="flex min-h-0 flex-1 flex-col group-data-[collapsed]:hidden">
          <div className="min-h-0 flex-1 overflow-y-auto sidebar-scroll">
            <StarredSidebarList />
            <p className="px-5 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-wide text-bone-400">
              Recents
            </p>
            <ConversationSidebarList />
          </div>
        </div>
      ) : null}

      {/* Apps section — pinned above footer, never pushed off-screen.
          shrink-0 prevents flex from compressing it. */}
      {user ? (
        <details
          open
          className="shrink-0 border-t border-bone-800 px-2 py-2 group-data-[collapsed]:hidden"
        >
          <summary className="cursor-pointer select-none list-none rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-bone-400 transition-colors hover:text-bone-200 [&::-webkit-details-marker]:hidden">
            Apps
          </summary>
          <div className="mt-1">
            <SidebarNav items={APP_NAV_ITEMS} />
          </div>
        </details>
      ) : null}

      {/* User footer */}
      {user ? (
        <div className="mt-auto border-t border-bone-700 px-3 py-3 group-data-[collapsed]:px-1 group-data-[collapsed]:py-2">
          {/* Avatar — always visible */}
          <div className="flex items-center gap-3 px-2 pb-2 group-data-[collapsed]:justify-center group-data-[collapsed]:px-0 group-data-[collapsed]:pb-0">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-claude-500/20 text-xs font-semibold text-claude-200"
            >
              {initials(user.displayName)}
            </div>
            {/* Name + role — hidden when collapsed */}
            <div className="min-w-0 flex-1 group-data-[collapsed]:hidden">
              <p className="truncate text-sm font-medium text-bone-50">
                {user.displayName}
              </p>
              <p className="text-xs text-bone-300">
                {user.role === "ADMIN" ? "Commissioner" : "Member"}
              </p>
            </div>
          </div>

          {/* Logout button — hidden when collapsed */}
          <form
            action="/api/auth/logout"
            method="post"
            className="group-data-[collapsed]:hidden"
          >
            <button
              type="submit"
              className="w-full rounded-lg border border-bone-700 bg-bone-800 px-3 py-2 text-xs font-medium text-bone-200 transition-colors hover:border-claude-500/60 hover:text-claude-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
            >
              Float Out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
