import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeFlowForLead } from "@/server/funnel-execution.server";
import { handleInboundForActiveAgent } from "@/server/agent-execution.server";
import { getOperationInstance } from "@/server/operations.server";
import { findOrUpsertLead, resolveLeadIdentity } from "@/server/lead-dedup.server";

async function triggerFlowsForInboundMessage(leadId: string, content: string | null, isNewLead: boolean) {
  const triggers: { type: string; valueMatches?: (v: string | null) => boolean }[] = [];
  if (isNewLead) triggers.push({ type: "new_lead" });
  if (content) {
    const normalized = content.toLowerCase();
    triggers.push({
      type: "keyword",
      valueMatches: (value) => !!value && normalized.includes(value.toLowerCase()),
    });
  }

  for (const trig of triggers) {
    const { data: flows, error } = await supabaseAdmin
      .from("flows")
      .select("id, trigger_value")
      .eq("trigger_type", trig.type)
      .eq("is_active", true);
    if (error) throw new Error(`flow trigger lookup failed: ${error.message}`);

    for (const flow of (flows || []) as any[]) {
      if (trig.valueMatches && !trig.valueMatches(flow.trigger_value)) continue;
      console.log(`[sync-chats] triggering flow ${flow.id} (${trig.type}) for lead ${leadId}`);
      await executeFlowForLead({ lead_id: leadId, flow_id: flow.id });
    }
  }
}

export const Route = createFileRoute("/api/public/sync-chats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const body = await request.json().catch(() => ({} as any));
        const operationId: string | null = body?.operation_id || null;
        if (!operationId) {
          return Response.json({ error: "operation_id é obrigatório" }, { status: 400 });
        }
        // Resolve instance from operation; fall back to env (single-instance legacy).
        const instance = (await getOperationInstance(operationId)) || null;
        if (!baseUrl || !apiKey || !instance) {
          return Response.json({ error: "Evolution env/instance not configured" }, { status: 500 });
        }
        console.log(`[sync-chats] op=${operationId} instance=${instance}`);
        const headers = { "Content-Type": "application/json", apikey: apiKey };

        const url = new URL(request.url);
        const chatsLimit = Math.max(1, Math.min(parseInt(url.searchParams.get("chats_limit") || "60", 10) || 60, 200));
        const msgsLimit = Math.max(1, Math.min(parseInt(url.searchParams.get("msgs_limit") || "30", 10) || 30, 100));

        const chatsRes = await fetch(`${baseUrl}/chat/findChats/${instance}`, {
          method: "POST", headers, body: JSON.stringify({}),
        });
        const chatsJson: any = await chatsRes.json().catch(() => []);
        let chats: any[] = Array.isArray(chatsJson) ? chatsJson : (chatsJson?.records || chatsJson?.chats || []);

        // Ordena chats por updatedAt/lastMsgTimestamp desc e limita.
        const tsOf = (c: any) =>
          Number(c.updatedAt || c.updated_at || c.lastMessageTimestamp || c.t || c.messageTimestamp || 0);
        chats = chats
          .filter((c) => {
            const rj: string | undefined = c.remoteJid || c.id;
            return rj && !rj.endsWith("@g.us");
          })
          .sort((a, b) => tsOf(b) - tsOf(a))
          .slice(0, chatsLimit);

        let synced = 0;
        let newMessages = 0;
        for (const chat of chats) {
          const sourceRemoteJid: string = chat.remoteJid || chat.id;
          const identity = resolveLeadIdentity({
            remoteJid: sourceRemoteJid,
            remoteJidAlt: chat.remoteJidAlt || chat.lastMessage?.key?.remoteJidAlt || null,
            senderPn: chat.senderPn || chat.lastMessage?.key?.senderPn || null,
            participantPn: chat.participantPn || chat.lastMessage?.key?.participantPn || null,
            phoneNumber: chat.phoneNumber || null,
          });

          // Usa o timestamp da última mensagem do chat como first_contact_at
          // (evita marcar leads antigos como "novos hoje" quando criados via sync).
          const chatTs = Number(
            chat.lastMessageTimestamp || chat.updatedAt || chat.updated_at || chat.t || chat.messageTimestamp || 0,
          );
          const firstContactAt = chatTs > 0 ? new Date(chatTs * 1000).toISOString() : undefined;

          const { leadId, isNew } = await findOrUpsertLead({
            remoteJid: identity.remoteJid,
            alternateRemoteJids: identity.alternateRemoteJids,
            senderPn: identity.realPhone,
            pushName: chat.pushName || chat.name || null,
            instance,
            operationId,
            firstContactAt,
            isNewLeadDefault: false,
            defaultTags: [],
          });
          if (!leadId) continue;
          const isNewLead = isNew;

          const msgsRes = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
            method: "POST", headers,
            body: JSON.stringify({
              where: { key: { remoteJid: sourceRemoteJid } },
              limit: msgsLimit,
              sort: { messageTimestamp: -1 },
            }),
          });
          const msgsJson: any = await msgsRes.json().catch(() => ({}));
          const msgs: any[] = msgsJson?.messages?.records || msgsJson?.records || [];

          // Bulk dedup: pega todos os evolution_message_ids deste lead que já existem
          // para os IDs vindos da Evolution, em UMA query.
          const evoIds = msgs.map((m) => m?.key?.id).filter(Boolean) as string[];
          let existing = new Set<string>();
          if (evoIds.length) {
            const { data: dups } = await supabaseAdmin
              .from("messages")
              .select("evolution_message_id")
              .in("evolution_message_id", evoIds);
            existing = new Set((dups || []).map((d: any) => d.evolution_message_id));
          }

          const rowsToInsert: any[] = [];
          const inboundContents: (string | null)[] = [];
          for (const msg of msgs) {
            const evoId = msg.key?.id;
            if (!evoId || existing.has(evoId)) continue;

            const fromMe = !!msg.key?.fromMe;
            const m = msg.message || {};
            const content = m.conversation || m.extendedTextMessage?.text || null;
            let type = "text";
            if (m.imageMessage) type = "image";
            else if (m.audioMessage) type = "audio";
            else if (m.videoMessage) type = "video";
            else if (m.documentMessage) type = "document";

            const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
            rowsToInsert.push({
              lead_id: leadId, evolution_message_id: evoId,
              direction: fromMe ? "outbound" : "inbound",
              type, content, is_ai: false,
              sent_by: fromMe ? "system" : "lead",
              sent_at: new Date(ts).toISOString(),
            });
            if (!fromMe) inboundContents.push(content);
          }

          if (rowsToInsert.length) {
            const { error: insertError } = await supabaseAdmin.from("messages").insert(rowsToInsert);
            if (insertError) {
              console.error("[sync-chats] bulk insert failed:", insertError.message);
              continue;
            }
            newMessages += rowsToInsert.length;
            for (const content of inboundContents) {
              try {
                const handled = await handleInboundForActiveAgent(leadId, content);
                if (!handled) {
                  await triggerFlowsForInboundMessage(leadId, content, isNewLead);
                }
              } catch (e) { console.error("[sync-chats] flow trigger error", e); }
            }
          }
          synced++;
        }

        return Response.json({ synced, new_messages: newMessages });
      },
    },
  },
});
