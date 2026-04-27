import { AdminSectionNav } from "@/components/AdminSectionNav";

const OPS_SECTION_ITEMS = [
  { href: "/admin/ops/usage", label: "Usage" },
  { href: "/admin/ops/pricing", label: "Pricing" },
] as const;

export default function AdminOpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionNav items={OPS_SECTION_ITEMS} />
      {children}
    </div>
  );
}
