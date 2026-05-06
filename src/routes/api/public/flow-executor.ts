import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const Route = createFileRoute("/api/public/flow-executor")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }),
      POST: async ({ request }) => {
        const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
        try {
          const { lead_id, flow_id, start_block_index = 0 } = await request.json() as {
            lead_id: string; flow_id: string; start_block_index?: number;
          };
          if (!lead_id || !flow_id) {
            return new Response(JSON.stringify({ error: "missing lead_id/flow_id" }), { status: 400, headers: cors });
          }

          const origin = await getOrigin(request);

          const { data: blocks } = await supabaseAdmin
            .from("flow_blocks")
            .select("*")
            .eq("flow_id", flow_id)
            .order("order_index", { ascending: true });

          if (!blocks || blocks.length === 0) {
            return new Response(JSON.stringify({ ok: true, msg: "no blocks" }), { headers: cors });
          }

          const { data: lead } = await supabaseAdmin
            .from("leads").select("whatsapp_number, instance_name").eq("id", lead_id).maybeSingle();
          if (!lead) return new Response(JSON.stringify({ error: "lead not found" }), { status: 404, headers: cors });

          const now = new Date();

          for (let i = start_block_index; i < blocks.length; i++) {
            const block: any = blocks[i];

            if (block.block_type === "funnel" && block.reference_id) {
              try {
                const r = await fetch(`${origin}/api/public/funnel-scheduler`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lead_id, funnel_id: block.reference_id, trigger_time: now.toISOString() }),
                });
                const txt = await r.text();
                console.log(`[flow-executor] funnel-scheduler ${r.status}: ${txt}`);
              } catch (e) {
                console.error("[flow-executor] funnel-scheduler error", e);
              }
            } else if (block.block_type === "agent" && block.reference_id) {
              await supabaseAdmin.from("leads").update({ current_agent_id: block.reference_id }).eq("id", lead_id);
              break;
            } else if (block.block_type === "tag_assign" && block.reference_id) {
              await supabaseAdmin.from("lead_tags").upsert(
                { lead_id, tag_id: block.reference_id, assigned_by: "flow" },
                { onConflict: "lead_id,tag_id" } as any,
              );
            } else if (block.block_type === "tag_remove" && block.reference_id) {
              await supabaseAdmin.from("lead_tags").delete().eq("lead_id", lead_id).eq("tag_id", block.reference_id);
            } else if (block.block_type === "wait" && block.wait_minutes > 0) {
              const resumeAt = new Date(now.getTime() + block.wait_minutes * 60_000);
              await supabaseAdmin.from("scheduled_messages").insert({
                lead_id,
                instance_name: lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "",
                whatsapp_number: lead.whatsapp_number,
                message_type: "flow_resume",
                content: JSON.stringify({ flow_id, resume_block_index: i + 1 }),
                send_at: resumeAt.toISOString(),
                status: "pending",
              });
              break;
            } else if (block.block_type === "condition") {
              let met = false;
              if (block.condition_type === "sent_comprovante") {
                const { data } = await supabaseAdmin.from("comprovantes" as any)
                  .select("id").eq("lead_id", lead_id).eq("status", "confirmado").limit(1);
                met = (data?.length || 0) > 0;
              } else if (block.condition_type === "has_tag" && block.condition_value) {
                const { data } = await supabaseAdmin.from("lead_tags")
                  .select("id").eq("lead_id", lead_id).eq("tag_id", block.condition_value).limit(1);
                met = (data?.length || 0) > 0;
              } else if (block.condition_type === "replied") {
                const { data } = await supabaseAdmin.from("messages")
                  .select("id").eq("lead_id", lead_id).eq("direction", "inbound").limit(1);
                met = (data?.length || 0) > 0;
              } else if (block.condition_type === "keyword" && block.condition_value) {
                const { data } = await supabaseAdmin.from("messages")
                  .select("content").eq("lead_id", lead_id).eq("direction", "inbound")
                  .ilike("content", `%${block.condition_value}%`).limit(1);
                met = (data?.length || 0) > 0;
              }
              if (!met && block.branch_no_block_id) {
                const idx = blocks.findIndex((b: any) => b.id === block.branch_no_block_id);
                if (idx >= 0) {
                  await fetch(`${origin}/api/public/flow-executor`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead_id, flow_id, start_block_index: idx }),
                  }).catch(() => {});
                  return new Response(JSON.stringify({ ok: true, branched: "no" }), { headers: cors });
                }
                return new Response(JSON.stringify({ ok: true, ended: true }), { headers: cors });
              }
            }
          }

          return new Response(JSON.stringify({ ok: true }), { headers: cors });
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
