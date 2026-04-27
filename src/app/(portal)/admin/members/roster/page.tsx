import { prisma } from "@/lib/prisma";
import { updateMember } from "./actions";
import { SaveButton } from "@/components/SaveButton";
import { PromptSuggester } from "@/components/PromptSuggester";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const members = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      name: true,
      displayName: true,
      role: true,
      blurb: true,
      city: true,
      favoriteTeam: true,
    },
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-bone-300">
        Curate per-member context. The blurb is free-form prose injected
        into every agent prompt. The structured fields (city, favorite
        team) get appended in parentheses. Role is the commissioner gate
        — promote one of the others if you want to share the keys.
      </p>

      <ul className="space-y-6">
        {members.map((member) => (
          <li
            key={member.id}
            className="rounded-2xl border border-bone-700 bg-bone-900 p-6"
          >
            <form action={updateMember} className="space-y-4">
              <input type="hidden" name="id" value={member.id} />

              <header>
                <p className="font-display text-lg font-semibold text-bone-50">
                  {member.displayName}
                </p>
                <p className="text-xs uppercase tracking-wide text-bone-400">
                  @{member.name}
                </p>
              </header>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor={`displayName-${member.id}`}
                    className="text-xs font-medium text-bone-200"
                  >
                    Display name
                  </label>
                  <input
                    id={`displayName-${member.id}`}
                    name="displayName"
                    type="text"
                    defaultValue={member.displayName}
                    required
                    className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`role-${member.id}`}
                    className="text-xs font-medium text-bone-200"
                  >
                    Role
                  </label>
                  <select
                    id={`role-${member.id}`}
                    name="role"
                    defaultValue={member.role}
                    className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Commissioner</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`city-${member.id}`}
                    className="text-xs font-medium text-bone-200"
                  >
                    City
                  </label>
                  <input
                    id={`city-${member.id}`}
                    name="city"
                    type="text"
                    defaultValue={member.city ?? ""}
                    placeholder="e.g. Houston"
                    className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`favoriteTeam-${member.id}`}
                    className="text-xs font-medium text-bone-200"
                  >
                    Favorite team
                  </label>
                  <input
                    id={`favoriteTeam-${member.id}`}
                    name="favoriteTeam"
                    type="text"
                    defaultValue={member.favoriteTeam ?? ""}
                    placeholder="e.g. Texans"
                    className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`blurb-${member.id}`}
                  className="text-xs font-medium text-bone-200"
                >
                  Blurb (free-form, agents read this verbatim)
                </label>
                <textarea
                  id={`blurb-${member.id}`}
                  name="blurb"
                  defaultValue={member.blurb ?? ""}
                  rows={5}
                  placeholder={`e.g. "Texas guy. Runs the league like a military operation. Married to Jen. Big Longhorns fan. Has fined Joey twice for lineup mistakes."`}
                  className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                />
                <div className="flex justify-end">
                  <PromptSuggester
                    textareaId={`blurb-${member.id}`}
                    endpoint="/api/admin/suggest-member-blurb"
                    extraPayload={{
                      memberName: member.name,
                      displayName: member.displayName,
                      city: member.city ?? "",
                      favoriteTeam: member.favoriteTeam ?? "",
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <SaveButton label={`Save ${member.displayName}`} />
              </div>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
