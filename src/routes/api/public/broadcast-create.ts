import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function rand(min: number, max: number) {
  if (max < min) max = min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const Route = createFileRoute("/api/public/broadcast-create")({
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
          const body = await request.json() as {
            name?: string;
            flow_id: string;
            tag_id: string;
            min_interval_seconds: number;
            max_interval_seconds: number;
          };
          const { flow_id, tag_id } = body;
          const minS = Math.max(1, Number(body.min_interval_seconds || 30));
          const maxS = Math.max(minS, Number(body.max_interval_seconds || 90));
          if (!flow_id || !tag_id) {
            return new Response(JSON.stringify({ error: "missing flow_id/tag_id" }), { status: 400, headers: cors });
          }

          const { data: leadTags, error: ltError } = await supabaseAdmin
            .from("lead_tags").select("lead_id").eq("tag_id", tag_id);
          if (ltError) throw new Error(ltError.message);

          const leadIds = Array.from(new Set((leadTags || []).map((r: any) => r.lead_id)));
          if (leadIds.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum lead encontrado para essa etiqueta" }), { status: 400, headers: cors });
          }

          const { data: leads, error: leadsError } = await supabaseAdmin
            .from("leads").select("id, status").in("id", leadIds);
          if (leadsError) throw new Error(leadsError.message);
          const activeIds = (leads || []).filter((l: any) => l.status === "active").map((l: any) => l.id);

          if (activeIds.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum lead ativo para essa etiqueta" }), { status: 400, headers: cors });
          }

          const { data: bc, error: bcError } = await supabaseAdmin
            .from("broadcasts").insert({
              name: body.name || "Disparo",
              flow_id, tag_id,
              min_interval_seconds: minS,
              max_interval_seconds: maxS,
              total_leads: activeIds.length,
              status: "running",
              started_at: new Date().toISOString(),
            }).select("id").single();
          if (bcError) throw new Error(bcError.message);

          let cursorMs = Date.now();
          const rows = activeIds.map((lead_id) => {
            const row = {
              broadcast_id: bc!.id,
              lead_id,
              scheduled_at: new Date(cursorMs).toISOString(),
              status: "pending",
            };
            cursorMs += rand(minS, maxS) * 1000;
            return row;
          });

          // Insert in chunks of 500 to be safe
          for (let i = 0; i < rows.length; i += 500) {
            const slice = rows.slice(i, i + 500);
            const { error } = await supabaseAdmin.from("broadcast_targets").insert(slice);
            if (error) throw new Error(error.message);
          }

          return new Response(JSON.stringify({ broadcast_id: bc!.id, total: activeIds.length }), { headers: cors });
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
