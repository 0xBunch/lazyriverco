import Link from "next/link";
import { IconLogout } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth";
import { ConversationSidebarList } from "@/components/ConversationSidebarList";
import { LazyRiverLogo } from "@/components/LazyRiverLogo";
import { SidebarNav } from "@/components/SidebarNav";
import { StarredSidebarList } from "@/components/StarredSidebarList";

function initials(displayName: string): string {
  const [first, second] = displayName.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export async function Sidebar() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

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

      {/* Main nav. Pass a string slot, not the items array — the items
          carry icon function refs which can't cross the RSC boundary. */}
      <SidebarNav slot="main" />

      {/* Starred + Recents — both sections scroll together inside a single
          lane so the total footprint adapts to how many pins the user has.
          Each list owns its own section header and renders nothing when
          empty (no orphaned headers). Collapsed-sidebar hides the whole
          stack. */}
      {user ? (
        <div className="flex min-h-0 flex-1 flex-col group-data-[collapsed]:hidden">
          <div className="min-h-0 flex-1 overflow-y-auto sidebar-scroll">
            <StarredSidebarList />
            <ConversationSidebarList />
          </div>
        </div>
      ) : null}

      {/* Bottom group — admin slot + user footer travel together, anchored
          to the bottom of the rail. mt-auto on the wrapper handles the
          collapsed case (where Recents is hidden and there's no flex-1
          element above to push everything down). Expanded case is unaffected
          because Recents already consumes the middle space. */}
      {user ? (
        <div className="mt-auto">
          {/* Admin slot — Control Panel sits one row above the user footer,
              so admin tools live next to the user account rather than mixed
              with daily-use tabs. */}
          {isAdmin ? <SidebarNav slot="admin" /> : null}

          {/* User footer — single row: avatar · name/role · logout icon.
              pb uses env(safe-area-inset-bottom) so the logout button clears
              the iOS home indicator in standalone PWA mode. Resolves to 0
              elsewhere (Android/desktop). */}
          <div className="border-t border-bone-700 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 group-data-[collapsed]:px-1 group-data-[collapsed]:pb-[calc(env(safe-area-inset-bottom)+0.5rem)] group-data-[collapsed]:pt-2">
          <div className="flex items-center gap-3 px-2 group-data-[collapsed]:justify-center group-data-[collapsed]:px-0">
            {/* Avatar — always visible */}
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
            {/* Logout — icon-only button; hidden when collapsed */}
            <form
              action="/api/auth/logout"
              method="post"
              className="shrink-0 group-data-[collapsed]:hidden"
            >
              <button
                type="submit"
                title="Log out"
                aria-label="Log out"
                className="flex h-8 w-8 items-center justify-center rounded-md text-bone-300 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
              >
                <IconLogout aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
