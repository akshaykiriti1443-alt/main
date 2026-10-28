import type { ConversationChannel, Stage, Temperature } from "@/lib/db/schema";

export type DomainEvent =
  | { type: "lead_created"; workspaceId: string; contactId: string; siteId?: string }
  | { type: "message_received"; workspaceId: string; contactId: string; conversationId: string; channel: ConversationChannel }
  | { type: "tag_added"; workspaceId: string; contactId: string; tag: string }
  | { type: "temperature_changed"; workspaceId: string; contactId: string; temperature: Temperature }
  | { type: "stage_changed"; workspaceId: string; contactId: string; stage: Stage };

// Fan a domain event out to email sequences and automations.
export async function emitEvent(event: DomainEvent) {
  const [{ enrollForEvent }, { startAutomationsForEvent }] = await Promise.all([
    import("./email/sequences"),
    import("./automations"),
  ]);
  await enrollForEvent(event);
  await startAutomationsForEvent(event);
}
