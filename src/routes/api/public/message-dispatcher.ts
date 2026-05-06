import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeFlowForLead } from "@/server/funnel-execution.server";

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
  const number = lead.remote_jid || msg.whatsapp_number || lead.whatsapp_number;
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

        // Requeue any "dispatching" rows stuck for >5min (worker died mid-send)
        await supabaseAdmin.rpc("requeue_stuck_dispatching", { p_older_than_seconds: 300 });

        // Atomically claim a batch of pending messages so concurrent cron ticks
        // never pick up the same row (FOR UPDATE SKIP LOCKED inside the RPC).
        const { data: claimed, error: claimError } = await supabaseAdmin
          .rpc("claim_scheduled_messages", { p_limit: 200 });
        if (claimError) {
          console.error("[dispatcher] claim error", claimError);
          return Response.json({ error: claimError.message }, { status: 500 });
        }
        const messages = claimed as any[] | null;
        if (!messages || messages.length === 0) {
          return Response.json({ dispatched: 0 });
        }

        // Hydrate funnel window info separately (RPC returns base table only).
        const funnelIds = Array.from(new Set(messages.map((m: any) => m.funnel_id).filter(Boolean)));
        const funnelMap = new Map<string, any>();
        if (funnelIds.length > 0) {
          const { data: fs } = await supabaseAdmin
            .from("funnels").select("id, window_start, window_end").in("id", funnelIds);
          (fs || []).forEach((f: any) => funnelMap.set(f.id, f));
        }
        for (const m of messages) {
          (m as any).funnels = m.funnel_id ? funnelMap.get(m.funnel_id) : null;
        }

        // Group by lead so we can serialize per-lead sends and respect spacing.
        const byLead = new Map<string, any[]>();
        for (const m of messages as any[]) {
          const arr = byLead.get(m.lead_id) || [];
          arr.push(m);
          byLead.set(m.lead_id, arr);
        }

        let dispatched = 0;
        let skipped = 0;

        const requeue = async (id: string) => {
          // claim already incremented attempts; just put it back as pending
          await supabaseAdmin.from("scheduled_messages").update({ status: "pending" }).eq("id", id);
        };

        const processOne = async (msg: any, lead: any) => {
          const stepType = (msg.message_type || "").toLowerCase();

          if (stepType === "flow_resume") {
            try {
              const payload = JSON.parse(msg.content || "{}");
              await executeFlowForLead({
                lead_id: msg.lead_id,
                flow_id: payload.flow_id,
                start_block_index: payload.resume_block_index || 0,
              });
            } catch (error) {
              console.error("[message-dispatcher] flow resume error", error);
            }
            await supabaseAdmin.from("scheduled_messages").update({ status: "sent" }).eq("id", msg.id);
            return "sent";
          }

          if (stepType === "tag") {
            const { data: stepRow } = await supabaseAdmin
              .from("funnel_steps").select("tag_id, tag_operation").eq("id", msg.step_id).maybeSingle();
            const tagId = (stepRow as any)?.tag_id;
            const op = (stepRow as any)?.tag_operation;
            if (tagId && op === "assign") {
              await supabaseAdmin.from("lead_tags").upsert(
                { lead_id: msg.lead_id, tag_id: tagId, assigned_by: "funnel" },
                { onConflict: "lead_id,tag_id" } as any,
              );
            } else if (tagId && op === "remove") {
              await supabaseAdmin.from("lead_tags").delete().eq("lead_id", msg.lead_id).eq("tag_id", tagId);
            }
            await supabaseAdmin.from("scheduled_messages").update({ status: "sent" }).eq("id", msg.id);
            return "sent";
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
            return "sent";
          } else {
            const attempts = msg.attempts || 1; // already incremented by claim RPC
            await supabaseAdmin.from("scheduled_messages").update({
              error_message: result.error,
              status: attempts >= 3 ? "failed" : "pending",
            }).eq("id", msg.id);
            return "failed";
          }
        };

        // Process each lead's queue serially. Delays between steps are already
        // encoded in send_at; only rows whose send_at <= now() were claimed,
        // so we just send them in order. No inline waits — that creates a race
        // window across concurrent cron ticks.
        await Promise.all(
          Array.from(byLead.entries()).map(async ([leadId, msgs]) => {
            const { data: lead } = await supabaseAdmin
              .from("leads")
              .select("whatsapp_number, remote_jid, name, push_name, status, ia_paused")
              .eq("id", leadId).maybeSingle();

            if (!lead || lead.status !== "active") {
              await supabaseAdmin.from("scheduled_messages")
                .update({ status: "cancelled" }).in("id", msgs.map((m: any) => m.id));
              return;
            }
            if ((lead as any).ia_paused) {
              await Promise.all(msgs.map((m: any) => requeue(m.id)));
              skipped += msgs.length;
              return;
            }

            for (let i = 0; i < msgs.length; i++) {
              const msg = msgs[i];
              const f = msg.funnels;
              const ws = f?.window_start || "00:00";
              const we = f?.window_end || "23:59";
              if (!isWithinWindow(ws, we)) {
                await requeue(msg.id);
                skipped++;
                continue;
              }

              const status = await processOne(msg, lead);
              if (status === "sent") dispatched++;
            }
          }),
        );

        await supabaseAdmin.rpc("check_completed_funnels");
        return Response.json({ dispatched, skipped });
      },
    },
  },
});
