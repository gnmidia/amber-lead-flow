import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeFlowForLead } from "@/server/funnel-execution.server";
import { getOperationByInstance } from "@/server/operations.server";

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
            const op = await getOperationByInstance(instance);
            if (!op) {
              console.warn(`[webhook] no operation found for instance=${instance}`);
              return new Response(`No operation for instance ${instance}`, { status: 400 });
            }
            const operationId = op.id;
            console.log(`[webhook] instance=${instance} -> operation=${operationId}`);

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
            let mediaMimetype: string | null = null;
            let mediaKind: "image" | "audio" | "video" | "document" | null = null;
            const msg = data.message ?? {};
            if (msg.conversation) content = msg.conversation;
            else if (msg.extendedTextMessage) content = msg.extendedTextMessage.text;
            else if (msg.imageMessage) {
              mediaUrl = msg.imageMessage.url;
              mediaMimetype = msg.imageMessage.mimetype || "image/jpeg";
              mediaKind = "image";
              content = msg.imageMessage.caption ?? null;
            } else if (msg.audioMessage) {
              mediaUrl = msg.audioMessage.url;
              mediaMimetype = msg.audioMessage.mimetype || "audio/ogg";
              mediaKind = "audio";
            } else if (msg.videoMessage) {
              mediaUrl = msg.videoMessage.url;
              mediaMimetype = msg.videoMessage.mimetype || "video/mp4";
              mediaKind = "video";
              content = msg.videoMessage.caption ?? null;
            } else if (msg.documentMessage) {
              mediaUrl = msg.documentMessage.url;
              mediaMimetype = msg.documentMessage.mimetype || "application/pdf";
              fileName = msg.documentMessage.fileName;
              mediaKind = "document";
            }

            // URLs vindas direto do payload do WhatsApp são criptografadas (.enc)
            // e não podem ser tocadas no navegador. Baixa o base64 via Evolution
            // e salva no storage para servir uma URL pública utilizável.
            if (mediaKind && key.id) {
              try {
                const evoBase = process.env.EVOLUTION_BASE_URL;
                const evoKey = process.env.EVOLUTION_API_KEY;
                if (evoBase && evoKey) {
                  const res = await fetch(`${evoBase}/chat/getBase64FromMediaMessage/${instance}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: evoKey },
                    body: JSON.stringify({ message: { key, message: msg }, convertToMp4: false }),
                  });
                  const j: any = await res.json().catch(() => ({}));
                  const b64: string | undefined = j?.base64;
                  if (b64) {
                    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                    const ext = mediaKind === "audio" ? "ogg"
                      : mediaKind === "image" ? (mediaMimetype?.split("/")[1] || "jpg")
                      : mediaKind === "video" ? "mp4"
                      : (fileName?.split(".").pop() || "bin");
                    const path = `inbound/${instance}/${key.id}.${ext}`;
                    const { error: upErr } = await supabaseAdmin.storage
                      .from("funnel-media")
                      .upload(path, bin, { contentType: mediaMimetype || "application/octet-stream", upsert: true });
                    if (!upErr) {
                      const { data: pub } = supabaseAdmin.storage.from("funnel-media").getPublicUrl(path);
                      if (pub?.publicUrl) mediaUrl = pub.publicUrl;
                    } else {
                      console.error("[webhook] media upload error", upErr);
                    }
                  }
                }
              } catch (e) {
                console.error("[webhook] media download error", e);
              }
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
                  operation_id: operationId,
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
                    executeFlowForLead({ lead_id: lead!.id, flow_id: fl.id })
                      .then((result) => console.log(`[webhook] flow-executor ok: ${JSON.stringify(result)}`))
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

          // Confirmação tardia da Evolution após o fire-and-forget de áudio.
          if (event === "send.message" && data?.key?.fromMe && data?.key?.id) {
            const key = data.key;
            const remoteJid: string = key.remoteJid ?? "";
            const isAudio =
              !!data.message?.audioMessage ||
              (typeof data.messageType === "string" && data.messageType.toLowerCase().includes("audio"));
            if (isAudio && remoteJid) {
              const { data: lead } = await supabaseAdmin
                .from("leads").select("id").eq("remote_jid", remoteJid).maybeSingle();
              if (lead) {
                const { data: target } = await supabaseAdmin
                  .from("messages")
                  .select("id")
                  .eq("lead_id", lead.id)
                  .eq("direction", "outbound")
                  .eq("type", "audio")
                  .is("evolution_message_id", null)
                  .order("sent_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (target) {
                  await supabaseAdmin.from("messages")
                    .update({ evolution_message_id: key.id })
                    .eq("id", target.id);
                }
              }
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
