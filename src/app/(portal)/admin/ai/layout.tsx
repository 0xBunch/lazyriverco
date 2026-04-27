import { AdminSectionNav } from "@/components/AdminSectionNav";

const AI_SECTION_ITEMS = [
  { href: "/admin/ai/personas", label: "Personas" },
  { href: "/admin/ai/opinions", label: "Opinions" },
  { href: "/admin/ai/prompts", label: "Prompts" },
] as const;

export default function AdminAiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionNav items={AI_SECTION_ITEMS} />
      {children}
    </div>
  );
}
