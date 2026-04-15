import { getCurrentUser } from "@/lib/auth";
import { SidebarNav } from "@/components/SidebarNav";

function initials(displayName: string): string {
  const [first, second] = displayName.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export async function Sidebar() {
  const user = await getCurrentUser();

  return (
    <div className="flex h-full flex-col">
      {/* Header / logo */}
      <div className="px-5 pb-2 pt-6">
        <p className="font-display text-lg font-semibold tracking-tight text-bone-50">
          The Lazy River Co.
        </p>
        <p className="mt-1 text-xs text-bone-300 italic">
          Members only.
        </p>
      </div>

      {/* Nav */}
      <SidebarNav />

      {/* User footer */}
      {user ? (
        <div className="border-t border-bone-700 px-3 py-4">
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
