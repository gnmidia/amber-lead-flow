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

            // Extrai o número real do telefone. Para JIDs @lid, o telefone real
            // vem em senderPn / participantPn (Evolution API). Caso contrário,
            // remove o sufixo padrão @s.whatsapp.net / @c.us.
            const realPhone: string | null =
              key.senderPn || key.participantPn || data.senderPn || data.participantPn || null;
            const isLid = remoteJid.endsWith("@lid");
            const fallback = remoteJid.replace(/@s\.whatsapp\.net$|@c\.us$|@lid$/, "");
            const number = (realPhone || (isLid ? fallback : fallback)).replace(/\D/g, "") || fallback;

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

            // Procura primeiro pelo remote_jid (chave estável), depois pelo número.
            let isNewLead = false;
            let { data: lead } = await supabaseAdmin
              .from("leads")
              .select("id, whatsapp_number")
              .eq("remote_jid", remoteJid)
              .maybeSingle();

            if (!lead) {
              const { data: byNumber } = await supabaseAdmin
                .from("leads")
                .select("id, whatsapp_number")
                .eq("whatsapp_number", number)
                .maybeSingle();
              lead = byNumber;
            }

            if (!lead) {
              const { data: newLead, error } = await supabaseAdmin
                .from("leads")
                .insert({
                  whatsapp_number: number,
                  remote_jid: remoteJid,
                  name: pushName || number,
                  push_name: pushName,
                  is_new_lead: true,
                  first_contact_at: messageTimestamp,
                  instance_name: instance,
                  tags: ["LEAD_NOVO"],
                })
                .select("id, whatsapp_number")
                .single();
              if (error) {
                console.error("[webhook] insert lead error", error);
                return new Response("error", { status: 500 });
              }
              lead = newLead;
              isNewLead = true;
            } else if (realPhone && lead.whatsapp_number !== number) {
              // Backfill: agora temos o telefone real, atualiza o lead que estava com LID.
              await supabaseAdmin
                .from("leads")
                .update({ whatsapp_number: number, remote_jid: remoteJid })
                .eq("id", lead.id);
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

            // ───── Disparar fluxos automáticos ─────
            try {
              const origin = new URL(request.url).origin;
              const triggers: { type: string; valueMatches?: (v: string | null) => boolean }[] = [];
              if (isNewLead) triggers.push({ type: "new_lead" });
              if (content) {
                const c = content.toLowerCase();
                triggers.push({
                  type: "keyword",
                  valueMatches: (v) => !!v && c.includes(v.toLowerCase()),
                });
              }
              const flowCalls: Promise<any>[] = [];
              for (const trig of triggers) {
                const { data: flows } = await supabaseAdmin
                  .from("flows")
                  .select("id, trigger_value")
                  .eq("trigger_type", trig.type)
                  .eq("is_active", true);
                for (const fl of (flows || []) as any[]) {
                  if (trig.valueMatches && !trig.valueMatches(fl.trigger_value)) continue;
                  console.log(`[webhook] triggering flow ${fl.id} (${trig.type}) for lead ${lead!.id}`);
                  flowCalls.push(
                    fetch(`${origin}/api/public/flow-executor`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lead_id: lead!.id, flow_id: fl.id }),
                    })
                      .then((r) => r.text().then((t) => console.log(`[webhook] flow-executor ${r.status}: ${t}`)))
                      .catch((e) => console.error("[webhook] flow-executor error", e)),
                  );
                }
              }
              await Promise.all(flowCalls);
            } catch (e) {
              console.error("[webhook] flow trigger error", e);
            }
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
