import { Sidebar } from "@/components/Sidebar";
import { SidebarShell } from "@/components/SidebarShell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell sidebar={<Sidebar />}>{children}</SidebarShell>;
}
