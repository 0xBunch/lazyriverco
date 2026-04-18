import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DraftBoard } from "@/components/DraftBoard";

export default async function FantasyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/start");
  return <DraftBoard isAdmin={user.role === "ADMIN"} />;
}
