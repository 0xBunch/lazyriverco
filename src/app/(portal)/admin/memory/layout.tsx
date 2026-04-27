import { AdminSectionNav } from "@/components/AdminSectionNav";

const MEMORY_SECTION_ITEMS = [
  { href: "/admin/memory/roster", label: "Roster" },
  { href: "/admin/memory/canon", label: "Canon" },
  { href: "/admin/memory/lore", label: "Lore" },
  { href: "/admin/memory/taxonomy", label: "Taxonomy" },
  { href: "/admin/memory/feeds", label: "Feeds" },
  { href: "/admin/memory/library", label: "Library" },
  { href: "/admin/memory/prompts", label: "Prompts" },
] as const;

export default function AdminMemoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionNav items={MEMORY_SECTION_ITEMS} />
      {children}
    </div>
  );
}
