import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isDraft2026Enabled } from "@/lib/draft-flags";

export const metadata = {
  title: "MLF Rookie Draft 2026",
};

// ---------------------------------------------------------------------------
// /sports/mlf/draft-2026 — public draft surface.
//
// v1 (this PR): skeleton only. Returns one of three states:
//
//   1. DRAFT_2026_ENABLED=false       → "Draft not yet open" placeholder.
//   2. Enabled, but no DraftRoom with slug "mlf-2026" yet → same placeholder.
//   3. Enabled + draft exists → still shows a placeholder in v1 since the
//      real draft UX (on-clock banner, big board, dossier, snake grid,
//      Goodell box, reactions feed) lands in Phase 2. Admins see a link
//      into /admin/draft/[id] to finish setup.
//
// The full mockup of the final UI lives at /mockup/draft-2026. That
// reference is what Phase 2 promotes to this route — same components,
// same palette, same fonts; wired to real Draft* data instead of fixtures.
// ---------------------------------------------------------------------------

const DRAFT_SLUG = "mlf-2026";

export default async function DraftPage() {
  const enabled = isDraft2026Enabled();

  const draft = enabled
    ? await prisma.draftRoom.findUnique({
        where: { slug: DRAFT_SLUG },
        select: { id: true, name: true, status: true, season: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-claude-300">
          Mens League of Football
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50 md:text-4xl">
          Rookie Draft 2026
        </h1>
      </header>

      <section className="mt-8 rounded-2xl border border-bone-700 bg-bone-900 p-6">
        {!enabled ? (
          <NotYetOpen reason="flag" />
        ) : !draft ? (
          <NotYetOpen reason="no-draft" />
        ) : draft.status === "setup" ? (
          <SetupInProgress name={draft.name} />
        ) : draft.status === "paused" ? (
          <Paused name={draft.name} />
        ) : draft.status === "complete" ? (
          <Complete name={draft.name} />
        ) : (
          <LiveComingSoon name={draft.name} />
        )}
      </section>

      <p className="mt-6 text-center text-xs text-bone-400">
        Curious what this will look like?{" "}
        <Link
          href="/mockup/draft-2026"
          className="text-claude-300 underline decoration-claude-500/50 underline-offset-2 hover:text-claude-200"
        >
          See the design mockup →
        </Link>
      </p>
    </div>
  );
}

function NotYetOpen({ reason }: { reason: "flag" | "no-draft" }) {
  return (
    <div className="space-y-3 text-center">
      <p className="font-display text-lg font-semibold text-bone-100">
        Draft not yet open.
      </p>
      <p className="text-sm text-bone-300">
        {reason === "flag"
          ? "The draft is still being staged behind the scenes. Check back after the NFL Draft wraps."
          : "The 2026 draft room hasn't been set up yet. Check back soon."}
      </p>
    </div>
  );
}

function SetupInProgress({ name }: { name: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="font-display text-lg font-semibold text-bone-100">
        {name}
      </p>
      <p className="text-sm text-bone-300">
        The commissioner is wiring up slots, the rookie pool, and the
        Goodell image stack. It&rsquo;ll open once setup is done.
      </p>
    </div>
  );
}

function Paused({ name }: { name: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="font-display text-lg font-semibold text-bone-100">{name}</p>
      <p className="text-sm text-bone-300">
        Draft paused by the commissioner. Back shortly.
      </p>
    </div>
  );
}

function Complete({ name }: { name: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="font-display text-lg font-semibold text-bone-100">{name}</p>
      <p className="text-sm text-bone-300">
        Draft complete. Final results archive coming in Phase 4.
      </p>
    </div>
  );
}

function LiveComingSoon({ name }: { name: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="font-display text-lg font-semibold text-bone-100">{name}</p>
      <p className="text-sm text-bone-300">
        Draft is live. The full interactive UI lands in Phase 2 — for now
        this page is a placeholder while the admin shell finishes setup.
      </p>
    </div>
  );
}
