import Link from "next/link";
import { formatUsd } from "../_format";

// Recent-events log for a single user's drilldown page. Pure
// presentational — the server page fetches the last 100 rows in
// createdAt-desc order and passes them in. No pagination; v1 cap of
// 100 is the spec.

export type UsageEventRow = {
  id: string;
  createdAt: Date;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  requestMs: number | null;
  success: boolean;
  errorCode: string | null;
  conversationId: string | null;
};

function formatTime(d: Date): string {
  try {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function EventsTable({ rows }: { rows: UsageEventRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-bone-700 bg-bone-950/40 p-6 text-sm italic text-bone-400">
        No events recorded for this member yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-bone-700 bg-bone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bone-800 bg-bone-950/40">
            <Th>Time</Th>
            <Th>Operation</Th>
            <Th>Model</Th>
            <Th align="right">Input</Th>
            <Th align="right">Output</Th>
            <Th align="right">Cached</Th>
            <Th align="right">Cost</Th>
            <Th align="right">Latency</Th>
            <Th>Status</Th>
            <Th>Chat</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-bone-800/50 last:border-b-0"
            >
              <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-bone-300 tabular-nums">
                {formatTime(row.createdAt)}
              </td>
              <td className="px-3 py-2 align-middle font-mono text-xs text-bone-100">
                {row.operation}
              </td>
              <td className="px-3 py-2 align-middle font-mono text-xs text-bone-200">
                {row.model}
              </td>
              <td className="px-3 py-2 text-right align-middle tabular-nums text-bone-300">
                {row.inputTokens.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right align-middle tabular-nums text-bone-300">
                {row.outputTokens.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right align-middle tabular-nums text-bone-300">
                {row.cacheReadTokens.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right align-middle tabular-nums text-bone-100">
                {formatUsd(row.estimatedCostUsd)}
              </td>
              <td className="px-3 py-2 text-right align-middle tabular-nums text-bone-400">
                {row.requestMs !== null ? `${row.requestMs} ms` : "—"}
              </td>
              <td className="px-3 py-2 align-middle text-xs">
                {row.success ? (
                  <span className="text-emerald-300">ok</span>
                ) : (
                  <span
                    className="text-red-300"
                    title={row.errorCode ?? undefined}
                  >
                    {row.errorCode ?? "error"}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 align-middle text-xs">
                {row.conversationId ? (
                  <Link
                    href={`/chat/${row.conversationId}`}
                    className="text-claude-300 underline decoration-claude-500/40 underline-offset-2 hover:decoration-claude-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
                  >
                    open
                  </Link>
                ) : (
                  <span className="text-bone-500">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-bone-400 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}
