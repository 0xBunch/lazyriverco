import { prisma } from "@/lib/prisma";
import { updateCanon } from "./actions";
import { SaveButton } from "@/components/SaveButton";

export const dynamic = "force-dynamic";

export default async function AdminCanonPage() {
  const canon = await prisma.clubhouseCanon.findFirstOrThrow({
    where: { name: "default" },
    select: { content: true, updatedAt: true },
  });

  const updatedLabel = canon.updatedAt.toISOString().slice(0, 16).replace("T", " ");

  return (
    <div className="space-y-4">
      <p className="text-sm text-bone-300">
        The broader Mens League / Lazy River Corporation canon. Club
        history, ongoing rivalries, running inside jokes, traditions,
        anything an agent should reference unprompted. Prepended to every
        agent prompt as the first context block.
      </p>

      <form
        action={updateCanon}
        className="space-y-4 rounded-2xl border border-bone-700 bg-bone-900 p-6"
      >
        <div className="space-y-1">
          <label
            htmlFor="canon-content"
            className="text-xs font-medium text-bone-200"
          >
            Canon (free-form, agents read this verbatim)
          </label>
          <textarea
            id="canon-content"
            name="content"
            defaultValue={canon.content}
            rows={20}
            placeholder={`e.g.\n\nMens League is the world's leading male philanthropic club for well-hung men. The Lazy River Corporation is a wholly-owned subsidiary that runs LAZYRIVER.CO, the club's corporate extranet. MLF (Mens League Fantasy) is our fantasy football league — just one piece of the broader Mens League ecosystem.\n\nThe crew: 7 members who argue about everything — sports, dating, food, travel, pop culture, celebrities.\n\nRunning bits:\n- "the kicker pickle" — Joey insists on drafting kickers in the first 5 rounds\n- Maverick's $20 lineup-late fines\n- Andreea's saint-tropez references\n- Billy's eternal "ok first of all"\n\n...etc.`}
            className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm leading-relaxed text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          />
          <p className="text-[0.7rem] text-bone-500">
            {canon.content.length} chars · last updated {updatedLabel} UTC
          </p>
        </div>

        <div className="flex justify-end">
          <SaveButton label="Save canon" />
        </div>
      </form>
    </div>
  );
}
