import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function evoHeaders(apiKey: string) {
  return { "Content-Type": "application/json", apikey: apiKey };
}

function isWithinWindow(start: string, end: string): boolean {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const brt = new Date(utcMs - 3 * 60 * 60000);
  const cur = brt.getHours() * 60 + brt.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return cur >= sh * 60 + sm && cur <= eh * 60 + em;
}

function resolveVars(content: string, lead: any): string {
  const name = lead.name || lead.push_name || "";
  return content
    .replace(/\{nome\}/g, name)
    .replace(/\{primeiro_nome\}/g, name.split(" ")[0])
    .replace(/\{numero\}/g, lead.whatsapp_number || "");
}

async function sendToEvolution(baseUrl: string, apiKey: string, instance: string, msg: any, lead: any) {
  const number = msg.whatsapp_number;
  const delay = 1200;
  try {
    let endpoint = "";
    let body: any = {};
    const t = (msg.message_type || "").toLowerCase();

    if (t === "text" || t === "texto") {
      endpoint = `/message/sendText/${instance}`;
      body = { number, text: resolveVars(msg.content || "", lead), delay };
    } else if (t === "image" || t === "imagem") {
      endpoint = `/message/sendMedia/${instance}`;
      body = { number, mediatype: "image", mimetype: msg.mimetype || "image/jpeg", media: msg.media_url, fileName: msg.file_name || "image.jpg", caption: msg.caption || "", delay };
    } else if (t === "video") {
      endpoint = `/message/sendMedia/${instance}`;
      body = { number, mediatype: "video", mimetype: msg.mimetype || "video/mp4", media: msg.media_url, fileName: msg.file_name || "video.mp4", caption: msg.caption || "", delay };
    } else if (t === "document" || t === "documento") {
      endpoint = `/message/sendMedia/${instance}`;
      body = { number, mediatype: "document", mimetype: msg.mimetype || "application/pdf", media: msg.media_url, fileName: msg.file_name || "arquivo.pdf", caption: msg.caption || "", delay };
    } else if (t === "audio" || t === "áudio") {
      await fetch(`${baseUrl}/chat/sendPresence/${instance}`, {
        method: "POST", headers: evoHeaders(apiKey),
        body: JSON.stringify({ number, options: { delay: 2000, presence: "recording", number } }),
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
      endpoint = `/message/sendWhatsAppAudio/${instance}`;
      body = { number, audio: msg.media_url, delay: 500 };
    } else {
      return { success: false, error: `Unsupported type: ${t}` };
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST", headers: evoHeaders(apiKey), body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return { success: true, messageId: json?.key?.id };
    return { success: false, error: JSON.stringify(json) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export const Route = createFileRoute("/api/public/message-dispatcher")({
  server: {
    handlers: {
      POST: async () => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        if (!baseUrl || !apiKey) {
          return Response.json({ error: "Evolution env not configured" }, { status: 500 });
        }

        const { data: messages } = await supabaseAdmin
          .from("scheduled_messages")
          .select("*, funnels(window_start, window_end)")
          .lte("send_at", new Date().toISOString())
          .eq("status", "pending")
          .order("send_at", { ascending: true })
          .limit(50);

        if (!messages || messages.length === 0) {
          return Response.json({ dispatched: 0 });
        }

        let dispatched = 0;
        let skipped = 0;

        for (const msg of messages as any[]) {
          const f = msg.funnels;
          const ws = f?.window_start || "00:00";
          const we = f?.window_end || "23:59";
          if (!isWithinWindow(ws, we)) { skipped++; continue; }

          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("whatsapp_number, name, push_name, status, ia_paused")
            .eq("id", msg.lead_id).maybeSingle();

          if (!lead || lead.status !== "active") {
            await supabaseAdmin.from("scheduled_messages")
              .update({ status: "cancelled" }).eq("id", msg.id);
            continue;
          }

          if ((lead as any).ia_paused) {
            skipped++;
            continue;
          }

          // Handle flow_resume (bloco Aguardar)
          const stepType = (msg.message_type || "").toLowerCase();
          if (stepType === "flow_resume") {
            try {
              const payload = JSON.parse(msg.content || "{}");
              const origin = process.env.PUBLIC_APP_URL || "";
              if (origin) {
                fetch(`${origin}/api/public/flow-executor`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lead_id: msg.lead_id, flow_id: payload.flow_id, start_block_index: payload.resume_block_index || 0 }),
                }).catch(() => {});
              }
            } catch {}
            await supabaseAdmin.from("scheduled_messages")
              .update({ status: "sent" }).eq("id", msg.id);
            dispatched++;
            continue;
          }

          // Handle tag-action steps (no message dispatch)
          if (stepType === "tag") {
            const { data: stepRow } = await supabaseAdmin
              .from("funnel_steps")
              .select("tag_id, tag_operation")
              .eq("id", msg.step_id)
              .maybeSingle();
            const tagId = (stepRow as any)?.tag_id;
            const op = (stepRow as any)?.tag_operation;
            if (tagId && op === "assign") {
              await supabaseAdmin.from("lead_tags").upsert(
                { lead_id: msg.lead_id, tag_id: tagId, assigned_by: "funnel" },
                { onConflict: "lead_id,tag_id" } as any,
              );
            } else if (tagId && op === "remove") {
              await supabaseAdmin.from("lead_tags")
                .delete().eq("lead_id", msg.lead_id).eq("tag_id", tagId);
            }
            await supabaseAdmin.from("scheduled_messages")
              .update({ status: "sent" }).eq("id", msg.id);
            dispatched++;
            continue;
          }

          const result = await sendToEvolution(baseUrl, apiKey, msg.instance_name, msg, lead);

          if (result.success) {
            await supabaseAdmin.from("scheduled_messages").update({
              status: "sent", evolution_message_id: result.messageId,
            }).eq("id", msg.id);

            await supabaseAdmin.from("messages").insert({
              lead_id: msg.lead_id,
              evolution_message_id: result.messageId,
              direction: "outbound",
              type: msg.message_type,
              content: msg.content,
              media_url: msg.media_url,
              is_ai: false,
              sent_by: "system",
              sent_at: new Date().toISOString(),
            });

            dispatched++;
          } else {
            const attempts = (msg.attempts || 0) + 1;
            await supabaseAdmin.from("scheduled_messages").update({
              attempts, error_message: result.error,
              status: attempts >= 3 ? "failed" : "pending",
            }).eq("id", msg.id);
          }
        }

        await supabaseAdmin.rpc("check_completed_funnels");
        return Response.json({ dispatched, skipped });
      },
    },
  },
});
