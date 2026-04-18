import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PromptRegistry, type PromptGroupRow } from "./PromptRegistry";

// /admin/prompts — curate the dropdown groups shown beneath the homepage
// prompt box. Replaces the old hardcoded SUGGESTION_CHIPS array in
// ConversationLanding.tsx. Each group is a button; each item has a
// short label (shown in the dropdown) and a longer prompt text (pasted
// into the input on click).

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  await requireAdmin();

  const groups = await prisma.promptGroup.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      sortOrder: true,
      isActive: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          prompt: true,
          sortOrder: true,
          isActive: true,
        },
      },
    },
  });

  const rows: PromptGroupRow[] = groups;
  const totalItems = rows.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          Prompt suggestions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-bone-300 text-pretty">
          Dropdown groups shown beneath the homepage prompt box.{" "}
          {rows.length} group{rows.length === 1 ? "" : "s"}, {totalItems}{" "}
          item{totalItems === 1 ? "" : "s"}. Each group is a button that
          opens a menu; each item&rsquo;s prompt text lands in the input
          when picked. Hide (toggle inactive) to remove from the homepage
          without deleting.
        </p>
      </header>

      <PromptRegistry rows={rows} />
    </div>
  );
}
