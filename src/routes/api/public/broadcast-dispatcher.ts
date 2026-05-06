import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeFlowForLead } from "@/server/funnel-execution.server";

export const Route = createFileRoute("/api/public/broadcast-dispatcher")({
  server: {
    handlers: {
      POST: async () => {
        const { data: claimed, error } = await supabaseAdmin
          .rpc("claim_broadcast_targets", { p_limit: 25 });
        if (error) {
          console.error("[broadcast-dispatcher] claim error", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
        const targets = (claimed as any[]) || [];
        if (targets.length === 0) {
          await checkCompleted();
          return Response.json({ dispatched: 0 });
        }

        let dispatched = 0;
        let failed = 0;
        let reschedule = 0;
        const broadcastIds = new Set<string>();

        await Promise.all(targets.map(async (t: any) => {
          broadcastIds.add(t.broadcast_id);
          try {
            const { data: bc } = await supabaseAdmin
              .from("broadcasts")
              .select("flow_id, status, max_interval_seconds")
              .eq("id", t.broadcast_id).maybeSingle();

            if (!bc) {
              await supabaseAdmin.from("broadcast_targets").update({
                status: "skipped", processed_at: new Date().toISOString(),
                error_message: "broadcast removido",
              }).eq("id", t.id);
              return;
            }

            const status = (bc as any).status;

            if (status === "cancelled") {
              await supabaseAdmin.from("broadcast_targets").update({
                status: "skipped", processed_at: new Date().toISOString(),
                error_message: "broadcast cancelado",
              }).eq("id", t.id);
              return;
            }

            if (status === "paused") {
              // Devolve para pending sem incrementar nada
              await supabaseAdmin.from("broadcast_targets").update({
                status: "pending",
              }).eq("id", t.id);
              return;
            }

            // Verifica se lead ainda está ativo
            const { data: lead } = await supabaseAdmin
              .from("leads").select("status").eq("id", t.lead_id).maybeSingle();
            if (!lead || (lead as any).status !== "active") {
              await supabaseAdmin.from("broadcast_targets").update({
                status: "skipped", processed_at: new Date().toISOString(),
                error_message: "lead inativo",
              }).eq("id", t.id);
              return;
            }

            // Regra: se lead tem funil ativo, reagenda para daqui a max_interval_seconds
            const { data: activeState } = await supabaseAdmin
              .from("lead_funnel_states")
              .select("id").eq("lead_id", t.lead_id).eq("status", "active")
              .maybeSingle();

            if (activeState) {
              const newAt = new Date(Date.now() + ((bc as any).max_interval_seconds || 60) * 1000).toISOString();
              await supabaseAdmin.from("broadcast_targets").update({
                status: "pending",
                scheduled_at: newAt,
                error_message: "aguardando funil ativo do lead",
              }).eq("id", t.id);
              reschedule++;
              return;
            }

            await executeFlowForLead({ lead_id: t.lead_id, flow_id: (bc as any).flow_id });
            await supabaseAdmin.from("broadcast_targets").update({
              status: "sent", processed_at: new Date().toISOString(),
            }).eq("id", t.id);
            dispatched++;
          } catch (err) {
            await supabaseAdmin.from("broadcast_targets").update({
              status: "failed", processed_at: new Date().toISOString(),
              error_message: String(err),
            }).eq("id", t.id);
            failed++;
          }
        }));

        await checkCompleted(broadcastIds);

        return Response.json({ dispatched, failed, reschedule });
      },
    },
  },
});

async function checkCompleted(ids?: Set<string>) {
  let broadcastIds: string[] = [];
  if (ids && ids.size) {
    broadcastIds = Array.from(ids);
  } else {
    const { data } = await supabaseAdmin
      .from("broadcasts").select("id").eq("status", "running");
    broadcastIds = (data || []).map((r: any) => r.id);
  }
  for (const bid of broadcastIds) {
    const { count: pendingCount } = await supabaseAdmin
      .from("broadcast_targets")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", bid)
      .in("status", ["pending", "dispatching"]);
    if ((pendingCount || 0) === 0) {
      await supabaseAdmin.from("broadcasts").update({
        status: "completed", completed_at: new Date().toISOString(),
      }).eq("id", bid);
    }
  }
}
