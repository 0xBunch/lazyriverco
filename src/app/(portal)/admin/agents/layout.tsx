import { AdminSectionNav } from "@/components/AdminSectionNav";

const AGENTS_SECTION_ITEMS = [
  { href: "/admin/agents/personas", label: "Personas" },
  { href: "/admin/agents/opinions", label: "Opinions" },
] as const;

export default function AdminAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionNav items={AGENTS_SECTION_ITEMS} />
      {children}
    </div>
  );
}
