import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatFeed } from "@/components/ChatFeed";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Middleware should have already redirected; this is just a belt-check.
    redirect("/sign-in");
  }

  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: DEFAULT_CHANNEL_ID },
    select: { slug: true, displayName: true, description: true },
  });

  return <ChatFeed currentUserId={user.id} channel={channel} />;
}
