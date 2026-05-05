import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/sync-chats")({
  server: {
    handlers: {
      POST: async () => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE_NAME;
        if (!baseUrl || !apiKey || !instance) {
          return Response.json({ error: "Evolution env not configured" }, { status: 500 });
        }
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

          // Upsert pelo remote_jid (chave estável), com fallback pelo número.
          let { data: existing } = await supabaseAdmin
            .from("leads").select("id, whatsapp_number").eq("remote_jid", remoteJid).maybeSingle();
          if (!existing) {
            const { data: byNumber } = await supabaseAdmin
              .from("leads").select("id, whatsapp_number").eq("whatsapp_number", number).maybeSingle();
            existing = byNumber;
          }
          let leadId = existing?.id;
          if (!leadId) {
            const { data: newLead } = await supabaseAdmin.from("leads").insert({
              whatsapp_number: number, remote_jid: remoteJid,
              name: displayName, push_name: chat.pushName || chat.name || null,
              is_new_lead: false, instance_name: instance, tags: [],
            }).select("id").single();
            leadId = newLead?.id;
          } else if (realPhone && existing?.whatsapp_number !== number) {
            await supabaseAdmin.from("leads")
              .update({ whatsapp_number: number, remote_jid: remoteJid })
              .eq("id", leadId);
          }
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
            await supabaseAdmin.from("messages").insert({
              lead_id: leadId, evolution_message_id: evoId,
              direction: fromMe ? "outbound" : "inbound",
              type, content, is_ai: false,
              sent_by: fromMe ? "system" : "lead",
              sent_at: new Date(ts).toISOString(),
            });
          }
          synced++;
        }

        return Response.json({ synced });
      },
    },
  },
});
