import { redirect } from "next/navigation";

export default function AdminOpsIndex() {
  redirect("/admin/ops/usage");
}
