import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  uploadAnnouncerImage,
  deleteAnnouncerImage,
  resetRotation,
} from "./actions";

export const metadata = { title: "Announcer images · Admin" };

type Search = { msg?: string; error?: string };

// Jony-Ive touch: used images get a very subtle opacity dim + a small
// "used" tag. Unused ones stay crisp. At a glance the commissioner sees
// "what's fresh for the next pick" without needing a filter.

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";

export default async function ImagesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Search;
}) {
  const draft = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!draft) notFound();

  const images = await prisma.draftAnnouncerImage.findMany({
    where: { draftId: draft.id },
    orderBy: [{ createdAt: "desc" }],
    include: {
      consumedPick: {
        select: { overallPick: true },
      },
    },
  });

  const unused = images.filter((i) => !i.consumedPickId).length;
  const used = images.length - unused;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/admin/sports/mlf/draft/${draft.id}`}
          className="text-xs uppercase tracking-[0.18em] text-bone-400 hover:text-bone-200"
        >
          ← {draft.name}
        </Link>
        <h2 className="font-display text-xl font-semibold tracking-tight text-bone-50">
          Announcer image pool
        </h2>
        <p className="max-w-2xl text-sm text-bone-300">
          These are the images the Goodell box rotates through on each pick
          lock. Server picks one at random from the unused pile and marks
          it consumed. Run out? Reset rotation to recycle them.
        </p>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-bone-400">
          <span>{images.length} total</span>
          <span className="text-bone-600">·</span>
          <span className="text-emerald-300">{unused} unused</span>
          <span className="text-bone-600">·</span>
          <span>{used} consumed</span>
        </div>
      </header>

      {(searchParams.msg || searchParams.error) && (
        <div
          className={
            searchParams.error
              ? "rounded-md border border-red-500/50 bg-red-900/30 p-3 text-sm text-red-200"
              : "rounded-md border border-emerald-500/50 bg-emerald-900/30 p-3 text-sm text-emerald-200"
          }
        >
          {searchParams.error ?? searchParams.msg}
        </div>
      )}

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Upload
        </h3>
        <p className="mt-1 text-xs text-bone-400">
          JPG / PNG / WEBP / GIF, up to 10 MB. Label is optional — useful
          for your own records (&ldquo;Joyce in a Bears jersey&rdquo;). Files go
          directly to R2 under <code className="font-mono">generated/</code>.
        </p>
        <form
          action={uploadAnnouncerImage}
          encType="multipart/form-data"
          className="mt-3 grid gap-3 md:grid-cols-[2fr_3fr_auto]"
        >
          <input type="hidden" name="draftId" value={draft.id} />
          <div>
            <label className="text-xs font-medium text-bone-200" htmlFor="img-file">
              Image file
            </label>
            <input
              id="img-file"
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp,image/gif"
              required
              className="mt-1 w-full text-sm text-bone-100 file:mr-3 file:rounded-md file:border-0 file:bg-claude-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-bone-950 file:hover:bg-claude-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-bone-200" htmlFor="img-label">
              Label (optional)
            </label>
            <input
              id="img-label"
              type="text"
              name="label"
              maxLength={80}
              placeholder="Joyce in a Bears jersey"
              className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-[38px] rounded-md bg-claude-500 px-4 text-sm font-semibold text-bone-950 transition hover:bg-claude-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Upload
            </button>
          </div>
        </form>
      </section>

      {used > 0 && (
        <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold text-bone-50">
              Reset rotation
            </h3>
            <form action={resetRotation}>
              <input type="hidden" name="draftId" value={draft.id} />
              <button
                type="submit"
                className="rounded-md border border-bone-700 px-3 py-1.5 text-sm font-semibold text-bone-200 transition hover:border-claude-500/60 hover:text-claude-200"
              >
                Reset {used} consumed images
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-bone-400">
            Marks all previously-consumed images as unused again. The Goodell
            box will draw from the full pool on the next pick.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Pool
        </h3>
        {images.length === 0 ? (
          <p className="mt-3 italic text-sm text-bone-400">
            Empty. Upload a few images above — 20+ gives the rotation some
            legs.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((img) => {
              const url = R2_BASE
                ? `${R2_BASE.replace(/\/+$/, "")}/${img.r2Key}`
                : "";
              const consumed = !!img.consumedPickId;
              return (
                <li
                  key={img.id}
                  className={
                    consumed
                      ? "group relative aspect-square overflow-hidden rounded-md border border-bone-800 bg-bone-950 opacity-50"
                      : "group relative aspect-square overflow-hidden rounded-md border border-bone-800 bg-bone-950 transition hover:border-claude-500/40"
                  }
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={img.label ?? "Announcer image"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-bone-500">
                      [ no R2 public URL configured ]
                    </div>
                  )}
                  {consumed && img.consumedPick && (
                    <div className="absolute left-2 top-2 rounded bg-bone-950/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-claude-300">
                      Used · pk {img.consumedPick.overallPick}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-bone-950/80 px-2 py-1 text-[10px] text-bone-200 opacity-0 transition group-hover:opacity-100">
                    <span className="truncate italic">{img.label ?? "—"}</span>
                    <form action={deleteAnnouncerImage} className="contents">
                      <input type="hidden" name="id" value={img.id} />
                      <input type="hidden" name="draftId" value={draft.id} />
                      <button
                        type="submit"
                        className="ml-2 rounded-md border border-bone-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-bone-300 hover:border-red-500/50 hover:text-red-300"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
