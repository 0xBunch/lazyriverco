import { redirect } from "next/navigation";

export default function AdminMembersIndex() {
  redirect("/admin/members/roster");
}
