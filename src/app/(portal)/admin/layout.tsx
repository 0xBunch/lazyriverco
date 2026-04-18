import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminSubNav } from "@/components/AdminSubNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Belt + suspenders: middleware already enforces auth, getCurrentUser
  // verifies the cookie cryptographically, and we additionally enforce
  // role=ADMIN here. Any non-admin who finds the URL gets bounced to /chat.
  const user = await getCurrentUser();
  if (!user) redirect("/start");
  if (user.role !== "ADMIN") redirect("/chat");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pt-20 md:pt-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          Commissioner Room
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50">
          Lazy River admin
        </h1>
        <p className="mt-2 max-w-2xl text-sm italic text-bone-300">
          Curate the agents&rsquo; voices, what they know about the crew,
          and the broader Mens League canon. Anything you save here flows
          into the next agent response.
        </p>
      </header>

      <AdminSubNav />

      <main className="pt-6">{children}</main>
    </div>
  );
}
