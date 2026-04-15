// Placeholder — real implementation lands in TASK 07 (character orchestration
// against the Anthropic API). For now it just logs the trigger so POST
// /api/messages can fire-and-forget it without crashing.
export async function runOrchestrator(messageId: string): Promise<void> {
  console.log(`[orchestrator] triggered for message ${messageId}`);
}
