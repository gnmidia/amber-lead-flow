import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const Route = createFileRoute("/api/public/funnel-scheduler")({
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
        const cors = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        };
        try {
          const { lead_id, funnel_id, trigger_time } = await request.json() as {
            lead_id: string; funnel_id: string; trigger_time?: string;
          };

          const { data: lead } = await supabaseAdmin
            .from("leads").select("whatsapp_number, instance_name")
            .eq("id", lead_id).maybeSingle();
          if (!lead) return new Response(JSON.stringify({ error: "lead not found" }), { status: 404, headers: cors });

          const { data: funnel } = await supabaseAdmin
            .from("funnels").select("*").eq("id", funnel_id).maybeSingle();
          if (!funnel) return new Response(JSON.stringify({ error: "funnel not found" }), { status: 404, headers: cors });

          const { data: steps } = await supabaseAdmin
            .from("funnel_steps").select("*")
            .eq("funnel_id", funnel_id)
            .order("order_index", { ascending: true });
          if (!steps || steps.length === 0) {
            return new Response(JSON.stringify({ error: "no steps" }), { status: 404, headers: cors });
          }

          const triggerMs = new Date(trigger_time ?? Date.now()).getTime();
          const startDelayMin = rand(funnel.start_min ?? 0, funnel.start_max ?? 0);
          let cursorMs = triggerMs + startDelayMin * 60_000;

          const rows = steps.map((s: any) => {
            const isFixed = s.delay_type === "fixed" || s.delay_type === "fixo";
            const delaySec = isFixed
              ? (s.delay_fixed ?? 30)
              : rand(s.delay_min ?? 20, s.delay_max ?? 120);
            cursorMs += delaySec * 1000;
            return {
              lead_id,
              funnel_id,
              step_id: s.id,
              instance_name: lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "cland-main",
              whatsapp_number: lead.whatsapp_number,
              message_type: s.type,
              content: s.content,
              media_url: s.media_url,
              file_name: s.file_name,
              mimetype: s.mimetype,
              caption: s.caption,
              send_at: new Date(cursorMs).toISOString(),
              status: "pending",
            };
          });

          const { error } = await supabaseAdmin.from("scheduled_messages").insert(rows);
          if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

          await supabaseAdmin.from("lead_funnel_states").upsert({
            lead_id, funnel_id, status: "active", started_at: new Date().toISOString(),
          }, { onConflict: "lead_id,funnel_id" });

          return new Response(JSON.stringify({ scheduled: rows.length }), { headers: cors });
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
