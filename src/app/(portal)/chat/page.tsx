import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChatFeed } from "@/components/ChatFeed";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Middleware should have already redirected; this is just a belt-check.
    redirect("/sign-in");
  }
  return <ChatFeed currentUserId={user.id} />;
}
