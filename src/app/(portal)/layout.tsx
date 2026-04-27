import { Sidebar } from "@/components/Sidebar";
import { SidebarShell } from "@/components/SidebarShell";
import { MlsnHeaderBar } from "@/components/sports/MlsnHeaderBar";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarShell sidebar={<Sidebar />} topBar={<MlsnHeaderBar />}>
      {children}
    </SidebarShell>
  );
}
