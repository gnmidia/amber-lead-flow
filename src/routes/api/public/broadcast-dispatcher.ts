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
          // Marca broadcasts completos
          await supabaseAdmin.rpc("check_completed_broadcasts").then(() => {}, () => {});
          return Response.json({ dispatched: 0 });
        }

        let dispatched = 0;
        let failed = 0;
        const broadcastIds = new Set<string>();

        await Promise.all(targets.map(async (t: any) => {
          broadcastIds.add(t.broadcast_id);
          try {
            const { data: bc } = await supabaseAdmin
              .from("broadcasts").select("flow_id, status").eq("id", t.broadcast_id).maybeSingle();
            if (!bc || (bc as any).status === "cancelled") {
              await supabaseAdmin.from("broadcast_targets").update({
                status: "skipped", processed_at: new Date().toISOString(),
                error_message: "broadcast cancelado",
              }).eq("id", t.id);
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

        // Atualiza status dos broadcasts envolvidos
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

        return Response.json({ dispatched, failed });
      },
    },
  },
});
