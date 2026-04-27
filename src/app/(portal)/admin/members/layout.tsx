import { AdminSectionNav } from "@/components/AdminSectionNav";

const MEMBERS_SECTION_ITEMS = [
  { href: "/admin/members/roster", label: "Roster" },
  { href: "/admin/members/usage", label: "Usage" },
  { href: "/admin/members/pricing", label: "Pricing" },
] as const;

export default function AdminMembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionNav items={MEMBERS_SECTION_ITEMS} />
      {children}
    </div>
  );
}
