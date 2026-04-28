import { prisma } from "@/lib/prisma";
import {
  createSponsor,
  deleteSponsor,
  generateSponsorImage,
  removeSponsorImage,
  toggleSponsorActive,
  updateSponsor,
} from "./actions";
import { UploadImageField } from "./UploadImageField";

export const dynamic = "force-dynamic";

const R2_PUBLIC_BASE =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";

function r2Url(key: string | null | undefined): string | null {
  if (!key) return null;
  if (!R2_PUBLIC_BASE) return null;
  return `${R2_PUBLIC_BASE}/${key}`;
}

type SearchParams = { msg?: string; error?: string; edit?: string };

export default async function AdminSportsSponsorsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;
  const editId = searchParams?.edit;

  const sponsors = await prisma.sportsSponsor.findMany({
    orderBy: [{ active: "desc" }, { displayOrder: "asc" }, { createdAt: "desc" }],
  });
  const editing = editId ? sponsors.find((s) => s.id === editId) ?? null : null;
  const activeCount = sponsors.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      {flashMsg && (
        <p className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200">
          {flashMsg}
        </p>
      )}
      {flashError && (
        <p className="rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-2 text-sm text-red-200">
          {flashError}
        </p>
      )}

      <p className="text-sm text-bone-300">
        Sponsors render in the mid-page broadcast-break rail on /sports.
        Active sponsors rotate by hashed UTC date — same brand all day,
        advances at midnight. Upload an image and pick a shape to ship a
        banner ad; leave the image blank for a text-only sponsor card.{" "}
        <strong className="font-semibold text-bone-100">{activeCount}</strong>{" "}
        active right now.
      </p>

      <form
        action={editing ? updateSponsor : createSponsor}
        className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
      >
        <p className="font-display text-sm font-semibold text-bone-50">
          {editing ? `Edit ${editing.name}` : "Add a sponsor"}
        </p>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            placeholder="Brand (e.g. Gatorade)"
            required
            maxLength={80}
            defaultValue={editing?.name ?? ""}
            className={inputCls}
          />
          <input
            name="displayOrder"
            type="number"
            placeholder="Display order"
            defaultValue={editing?.displayOrder ?? 0}
            className={inputCls}
          />
          <input
            name="tagline"
            placeholder='Tagline (e.g. "Stay in the game.")'
            maxLength={140}
            defaultValue={editing?.tagline ?? ""}
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            name="href"
            type="url"
            placeholder="Click-through URL (optional)"
            maxLength={2048}
            defaultValue={editing?.href ?? ""}
            className={`${inputCls} sm:col-span-2`}
          />
          <label className="flex items-center gap-2 text-sm text-bone-200 sm:col-span-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
              className="h-4 w-4 rounded border-bone-700 bg-bone-950 text-claude-500 focus:ring-claude-500"
            />
            Active in rotation
          </label>

          <div className="space-y-3 sm:col-span-2">
            <UploadImageField
              initialKey={editing?.imageR2Key ?? null}
              initialUrl={r2Url(editing?.imageR2Key)}
            />
            <input
              name="imageAltText"
              placeholder="Image alt text (a11y; falls back to brand name)"
              maxLength={280}
              defaultValue={editing?.imageAltText ?? ""}
              className={inputCls + " w-full"}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {editing && (
            <a href="/admin/sports/sponsors" className={btnCls}>
              Cancel
            </a>
          )}
          <button type="submit" className={btnPrimaryCls}>
            {editing ? "Save changes" : "Add sponsor"}
          </button>
        </div>
      </form>

      {editing && (
        <form
          action={generateSponsorImage}
          className="space-y-3 rounded-2xl border border-claude-700/40 bg-bone-900 p-5"
        >
          <input type="hidden" name="id" value={editing.id} />
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-sm font-semibold text-bone-50">
              Generate with AI
            </p>
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
              Nano Banana Pro · ~$0.04 / image · square
            </span>
          </div>
          <textarea
            name="prompt"
            placeholder="e.g. A cartoon hot dog wearing sunglasses, holding a foam finger that says 'GO TEAM,' broadcast-style sports sponsor banner, vibrant colors"
            required
            rows={3}
            maxLength={600}
            className={`${inputCls} w-full resize-y`}
          />
          <p className="text-xs text-bone-400">
            Replaces the current banner image (if any). Sets the shape to
            Square automatically. Edit the alt text in the form above
            after generating. Generation takes 5–15 seconds.
          </p>
          <div className="flex justify-end">
            <button type="submit" className={btnPrimaryCls}>
              Generate banner
            </button>
          </div>
        </form>
      )}

      {editing?.imageR2Key && (
        <form
          action={removeSponsorImage}
          className="rounded-2xl border border-bone-800 bg-bone-950 p-4 text-sm text-bone-300"
        >
          <input type="hidden" name="id" value={editing.id} />
          <div className="flex items-center justify-between gap-3">
            <p>
              <strong className="font-semibold text-bone-100">
                {editing.name}
              </strong>{" "}
              has a banner image attached. Removing it reverts the sponsor
              to text-only mode.
            </p>
            <button type="submit" className={btnDangerCls}>
              Remove image
            </button>
          </div>
        </form>
      )}

      {sponsors.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          No sponsors yet. Add one above to start the rotation.
        </p>
      ) : (
        <ul className="space-y-2">
          {sponsors.map((s) => {
            const thumbUrl = r2Url(s.imageR2Key);
            return (
              <li
                key={s.id}
                className={`flex gap-3 rounded-xl border p-4 ${
                  s.active
                    ? "border-bone-700 bg-bone-900"
                    : "border-bone-800 bg-bone-950 opacity-60"
                }`}
              >
                {thumbUrl ? (
                  <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-md border border-bone-800 bg-bone-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl}
                      alt={s.imageAltText ?? s.name}
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <p className="font-display text-base font-semibold uppercase tracking-tight text-bone-50">
                      {s.name}
                    </p>
                    <span className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                      sort {s.displayOrder} · {s.active ? "active" : "paused"}
                    </span>
                  </div>
                  {s.tagline && (
                    <p className="mt-1 text-sm italic text-bone-300">
                      &ldquo;{s.tagline}&rdquo;
                    </p>
                  )}
                  {s.href && (
                    <p className="mt-1 truncate text-xs text-bone-500">
                      →{" "}
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-bone-700 underline-offset-2 hover:text-bone-300"
                      >
                        {s.href}
                      </a>
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/admin/sports/sponsors?edit=${s.id}`} className={btnCls}>
                      Edit
                    </a>
                    <form action={toggleSponsorActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className={btnCls}>
                        {s.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteSponsor}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className={btnDangerCls}>
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500";
const btnPrimaryCls =
  "rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const btnCls =
  "inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500";
const btnDangerCls =
  "inline-flex items-center rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
