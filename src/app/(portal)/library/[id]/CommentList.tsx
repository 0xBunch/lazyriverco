import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";
import { initialsOf } from "@/lib/initials";
import { USER_MARKDOWN_COMPONENTS } from "@/lib/safe-markdown";
import { DeleteCommentForm } from "./CommentComposer";

// Server component. Fetches and renders comments for a single media
// row in chronological order. Replies are not wired yet — the schema
// has no parentId; flat list is intentional for v1.2.

export async function CommentList({
  mediaId,
  viewerId,
  viewerIsAdmin,
}: {
  mediaId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const rawRows = await prisma.comment.findMany({
    where: { mediaId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: { id: true, displayName: true, name: true, avatarUrl: true },
      },
    },
  });

  // Strip body for soft-deleted rows before it can ride the RSC payload —
  // tombstones render as "[comment removed]" regardless of role (admins
  // can still recover original text from the DB if needed).
  const rows = rawRows.map((c) => ({
    ...c,
    body: c.deletedAt ? "" : c.body,
  }));

  if (rows.length === 0) {
    return (
      <p className="text-sm italic text-bone-300">
        Be the first to say something.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-5">
      {rows.map((c) => {
        const isRemoved = c.deletedAt !== null;
        const canRemove = !isRemoved && (c.userId === viewerId || viewerIsAdmin);
        const when = c.createdAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        return (
          <li key={c.id} className="flex gap-3">
            <div className="mt-0.5 shrink-0">
              {c.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.user.avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bone-800 text-[11px] font-semibold text-bone-200">
                  {initialsOf(c.user.displayName)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-bone-300">
                <span className="text-bone-200">{c.user.displayName}</span>
                <span className="mx-1.5 text-bone-500" aria-hidden>
                  ·
                </span>
                <span>{when}</span>
              </p>
              {isRemoved ? (
                <p className="mt-1 text-sm italic text-bone-400">
                  [comment removed]
                </p>
              ) : (
                <div className="prose prose-invert prose-sm mt-1 max-w-none prose-p:my-1 prose-p:text-bone-200 prose-a:text-claude-300 prose-strong:text-bone-50">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={USER_MARKDOWN_COMPONENTS}
                  >
                    {c.body}
                  </ReactMarkdown>
                </div>
              )}
              {canRemove ? (
                <DeleteCommentForm commentId={c.id} mediaId={mediaId} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
