import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeFlowForLead } from "@/server/funnel-execution.server";
import { getOperationInstance } from "@/server/operations.server";
import { findOrUpsertLead } from "@/server/lead-dedup.server";

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

        const chatsRes = await fetch(`${baseUrl}/chat/findChats/${instance}`, {
          method: "POST", headers, body: JSON.stringify({}),
        });
        const chatsJson: any = await chatsRes.json().catch(() => []);
        const chats = Array.isArray(chatsJson) ? chatsJson : (chatsJson?.records || chatsJson?.chats || []);

        let synced = 0;
        for (const chat of chats) {
          const remoteJid: string | undefined = chat.remoteJid || chat.id;
          if (!remoteJid || remoteJid.endsWith("@g.us")) continue;

          // Telefone real: para JIDs @lid vem em senderPn / participantPn.
          const realPhone: string | null =
            chat.senderPn || chat.participantPn || chat.phoneNumber || null;
          const fallback = remoteJid.replace(/@s\.whatsapp\.net$|@c\.us$|@lid$/, "");
          const number = (realPhone || fallback).replace(/\D/g, "") || fallback;
          const displayName = chat.pushName || chat.name || number;

          if (!operationId) {
            console.warn("[sync-chats] missing operation_id; skipping chat");
            continue;
          }

          const { leadId, isNew } = await findOrUpsertLead({
            remoteJid,
            senderPn: realPhone,
            pushName: chat.pushName || chat.name || null,
            instance,
            operationId,
            isNewLeadDefault: false,
            defaultTags: [],
          });
          const isNewLead = isNew;
          if (!leadId) continue;

          const msgsRes = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
            method: "POST", headers,
            body: JSON.stringify({
              where: { key: { remoteJid } },
              limit: 100,
              sort: { messageTimestamp: -1 },
            }),
          });
          const msgsJson: any = await msgsRes.json().catch(() => ({}));
          const msgs: any[] = msgsJson?.messages?.records || msgsJson?.records || [];

          for (const msg of msgs) {
            const evoId = msg.key?.id;
            if (!evoId) continue;
            const { data: dup } = await supabaseAdmin.from("messages")
              .select("id").eq("evolution_message_id", evoId).maybeSingle();
            if (dup) continue;

            const fromMe = !!msg.key?.fromMe;
            const m = msg.message || {};
            const content = m.conversation || m.extendedTextMessage?.text || null;
            let type = "text";
            if (m.imageMessage) type = "image";
            else if (m.audioMessage) type = "audio";
            else if (m.videoMessage) type = "video";
            else if (m.documentMessage) type = "document";

            const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
            const { error: insertError } = await supabaseAdmin.from("messages").insert({
              lead_id: leadId, evolution_message_id: evoId,
              direction: fromMe ? "outbound" : "inbound",
              type, content, is_ai: false,
              sent_by: fromMe ? "system" : "lead",
              sent_at: new Date(ts).toISOString(),
            });
            if (insertError) throw new Error(`message insert failed: ${insertError.message}`);

            if (!fromMe) {
              await triggerFlowsForInboundMessage(leadId, content, isNewLead);
            }
          }
          synced++;
        }

        return Response.json({ synced });
      },
    },
  },
});
