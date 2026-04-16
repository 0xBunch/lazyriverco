import { redirect } from "next/navigation";

/**
 * Legacy `/chat` index. In phase 1 the personal-chat landing at `/`
 * replaced the group #mensleague channel view; individual threads now
 * live at `/chat/[conversationId]`. Kept as a redirect so existing
 * bookmarks don't 404.
 */
export default function ChatIndexRedirect() {
  redirect("/");
}
