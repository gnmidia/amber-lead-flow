import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/webhook-whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json() as any;
          const event = payload.event;
          const instance = payload.instance;
          const data = payload.data;

          if (event === "messages.upsert" && data?.key) {
            const key = data.key;
            const remoteJid: string = key.remoteJid ?? "";
            if (key.fromMe || remoteJid.endsWith("@g.us")) {
              return new Response("ok");
            }

            const number = remoteJid.replace("@s.whatsapp.net", "");
            const pushName = data.pushName ?? null;
            const messageType: string = data.messageType ?? "unknown";
            const messageTimestamp = new Date((data.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString();

            let content: string | null = null;
            let mediaUrl: string | null = null;
            let fileName: string | null = null;
            const msg = data.message ?? {};
            if (msg.conversation) content = msg.conversation;
            else if (msg.extendedTextMessage) content = msg.extendedTextMessage.text;
            else if (msg.imageMessage) mediaUrl = msg.imageMessage.url;
            else if (msg.audioMessage) mediaUrl = msg.audioMessage.url;
            else if (msg.videoMessage) mediaUrl = msg.videoMessage.url;
            else if (msg.documentMessage) {
              mediaUrl = msg.documentMessage.url;
              fileName = msg.documentMessage.fileName;
            }

            let { data: lead } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("whatsapp_number", number)
              .maybeSingle();

            if (!lead) {
              const { data: newLead, error } = await supabaseAdmin
                .from("leads")
                .insert({
                  whatsapp_number: number,
                  remote_jid: remoteJid,
                  name: pushName,
                  push_name: pushName,
                  is_new_lead: true,
                  first_contact_at: messageTimestamp,
                  instance_name: instance,
                  tags: ["LEAD_NOVO"],
                })
                .select("id")
                .single();
              if (error) {
                console.error("[webhook] insert lead error", error);
                return new Response("error", { status: 500 });
              }
              lead = newLead;
            }

            await supabaseAdmin.from("messages").insert({
              lead_id: lead!.id,
              evolution_message_id: key.id,
              direction: "inbound",
              type: messageType.replace("Message", ""),
              content,
              media_url: mediaUrl,
              file_name: fileName,
              is_ai: false,
              sent_by: "lead",
              sent_at: messageTimestamp,
            });

            await supabaseAdmin
              .from("leads")
              .update({ last_interaction_at: messageTimestamp })
              .eq("id", lead!.id);
          }

          if (event === "connection.update") {
            const state = data?.state;
            if (state && instance) {
              await supabaseAdmin
                .from("instances")
                .update({ status: state, updated_at: new Date().toISOString() })
                .eq("instance_name", instance);
            }
          }

          return new Response("ok");
        } catch (err) {
          console.error("[webhook] error", err);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
