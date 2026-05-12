import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeFlowForLead } from "@/server/funnel-execution.server";
import { handleInboundForActiveAgent } from "@/server/agent-execution.server";
import { getOperationByInstance } from "@/server/operations.server";
import { findOrUpsertLead, resolveLeadIdentity } from "@/server/lead-dedup.server";

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
            const sourceRemoteJid: string = key.remoteJid ?? "";
            if (key.fromMe || sourceRemoteJid.endsWith("@g.us")) {
              return new Response("ok");
            }

            const identity = resolveLeadIdentity({
              remoteJid: sourceRemoteJid,
              remoteJidAlt: key.remoteJidAlt || data.remoteJidAlt || null,
              senderPn: key.senderPn || data.senderPn || null,
              participantPn: key.participantPn || data.participantPn || null,
              phoneNumber: data.phoneNumber || null,
            });
            const number = identity.realPhone || identity.remoteJid.replace(/@s\.whatsapp\.net$|@c\.us$|@lid$/, "");

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

            // Resolve (find or create) the lead with LID-aware dedup.
            const { leadId, isNew } = await findOrUpsertLead({
              remoteJid: identity.remoteJid,
              alternateRemoteJids: identity.alternateRemoteJids,
              senderPn: identity.realPhone,
              pushName,
              instance,
              operationId,
              firstContactAt: messageTimestamp,
              isNewLeadDefault: true,
              defaultTags: ["LEAD_NOVO"],
            });
            const isNewLead = isNew;
            const lead = { id: leadId };

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

            // ───── Agente IA ativo? Se sim, ele responde e pulamos os fluxos ─────
            console.log(`[webhook] inbound recebido | lead=${lead!.id} | content="${(content || "").substring(0, 200)}"`);
            console.log(`[webhook] verificando agente ativo para lead=${lead!.id}`);
            let handledByAgent = false;
            try {
              handledByAgent = await handleInboundForActiveAgent(lead!.id, content);
            } catch (e) {
              console.error(`[webhook] handleInboundForActiveAgent error (silenced):`, e);
              handledByAgent = false;
            }
            console.log(`[webhook] handledByAgent=${handledByAgent}`);

            // ───── Disparar fluxos automáticos (apenas se nenhum agente está ativo) ─────
            if (!handledByAgent) {
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
                    .eq("is_active", true)
                    .eq("operation_id", operationId);
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
            const identity = resolveLeadIdentity({
              remoteJid: key.remoteJid ?? "",
              remoteJidAlt: key.remoteJidAlt || data.remoteJidAlt || null,
              senderPn: key.senderPn || data.senderPn || null,
              participantPn: key.participantPn || data.participantPn || null,
              phoneNumber: data.phoneNumber || null,
            });
            const remoteJid = identity.remoteJid;
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
          console.error("[webhook] error (silenced, returning 200):", err);
          return new Response("ok");
        }
      },
    },
  },
});
