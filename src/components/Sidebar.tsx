import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SidebarNav } from "@/components/SidebarNav";
import { ConversationSidebarList } from "@/components/ConversationSidebarList";
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

  // Admin gets the Commissioner tab appended to the main nav
  const mainNav: readonly NavItem[] = isAdmin
    ? [...MAIN_NAV_ITEMS, ADMIN_NAV_ITEM]
    : MAIN_NAV_ITEMS;

  return (
    <div className="flex h-full flex-col">
      {/* Header / logo — links back to chat landing */}
      <Link href="/" className="block px-5 pb-2 pt-6 transition-opacity hover:opacity-80">
        <p className="font-display text-lg font-semibold tracking-tight text-bone-50">
          The Lazy River Co.
        </p>
        <p className="mt-1 text-xs italic text-bone-300">Members only.</p>
      </Link>

      {/* New chat CTA */}
      {user ? (
        <div className="px-3 pb-1 pt-3">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-lg border border-bone-700 bg-bone-800 px-3 py-2 text-xs font-medium text-bone-100 transition-colors hover:border-claude-500/60 hover:text-claude-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
          >
            + New chat
          </Link>
        </div>
      ) : null}

      {/* Main nav — always visible: Chat, Calendar, Media (+Commissioner for admin) */}
      <SidebarNav items={mainNav} />

      {/* Recent conversations */}
      {user ? <ConversationSidebarList /> : null}

      {/* Apps section — collapsible, visible to everyone */}
      {user ? (
        <details open className="border-t border-bone-800 px-2 py-2">
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
        <div className="mt-auto border-t border-bone-700 px-3 py-4">
          <div className="flex items-center gap-3 px-2 pb-3">
            <div
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-claude-500/20 text-xs font-semibold text-claude-200"
            >
              {initials(user.displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-bone-50">
                {user.displayName}
              </p>
              <p className="text-xs text-bone-300">
                {user.role === "ADMIN" ? "Commissioner" : "Member"}
              </p>
            </div>
          </div>

          <form action="/api/auth/logout" method="post">
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
