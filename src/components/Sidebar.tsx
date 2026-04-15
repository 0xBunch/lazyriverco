import { getCurrentUser } from "@/lib/auth";

export async function Sidebar() {
  const user = await getCurrentUser();

  return (
    <aside className="flex w-64 flex-col justify-between border-r border-slate-800 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-200">
          The Lazy River Co.
        </p>
        <p className="mt-1 text-xs text-slate-500">Sidebar — Task 04</p>
      </div>
      <div className="space-y-3">
        {user ? (
          <p className="text-sm text-slate-300">
            Logged in as{" "}
            <span className="font-semibold text-slate-100">
              {user.displayName}
            </span>
          </p>
        ) : null}
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-river-500 hover:text-river-50"
          >
            Float Out
          </button>
        </form>
      </div>
    </aside>
  );
}
