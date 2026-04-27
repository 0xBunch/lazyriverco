import { redirect } from "next/navigation";

export default function AdminAgentsIndex() {
  redirect("/admin/agents/personas");
}
