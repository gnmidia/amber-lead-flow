import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { executeFlowForLead, getAdmin } from "../_shared/funnel-execution.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

function rand(min: number, max: number) {
  if (max < min) max = min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function releaseNextTarget(
  supabase: ReturnType<typeof getAdmin>,
  broadcast_id: string,
  current_lead_id: string,
  minS: number,
  maxS: number,
) {
  const { data: lastMsg } = await supabase
    .from("scheduled_messages")
    .select("send_at")
    .eq("lead_id", current_lead_id)
    .order("send_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const baseMs = lastMsg?.send_at
    ? new Date((lastMsg as any).send_at).getTime()
    : Date.now();
  const nextAt = new Date(baseMs + rand(minS, maxS) * 1000).toISOString();

  const { data: nextTarget } = await supabase
    .from("broadcast_targets")
    .select("id")
    .eq("broadcast_id", broadcast_id)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextTarget) {
    await supabase
      .from("broadcast_targets")
      .update({ scheduled_at: nextAt })
      .eq("id", (nextTarget as any).id);
  }
}

async function checkCompleted(supabase: ReturnType<typeof getAdmin>, ids?: Set<string>) {
  let broadcastIds: string[] = [];
  if (ids && ids.size) {
    broadcastIds = Array.from(ids);
  } else {
    const { data } = await supabase.from("broadcasts").select("id").eq("status", "running");
    broadcastIds = (data || []).map((r: any) => r.id);
  }
  for (const bid of broadcastIds) {
    const { count: pendingCount } = await supabase
      .from("broadcast_targets")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", bid)
      .in("status", ["pending", "dispatching"]);
    if ((pendingCount || 0) === 0) {
      await supabase.from("broadcasts").update({
        status: "completed", completed_at: new Date().toISOString(),
      }).eq("id", bid);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const supabase = getAdmin();
  try {
    const { data: claimed, error } = await supabase.rpc("claim_broadcast_targets", { p_limit: 25 });
    if (error) {
      console.error("[broadcast-dispatcher] claim error", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    }
    const targets = (claimed as any[]) || [];
    if (targets.length === 0) {
      await checkCompleted(supabase);
      return new Response(JSON.stringify({ dispatched: 0 }), { headers: cors });
    }

    let dispatched = 0, failed = 0, reschedule = 0;
    const broadcastIds = new Set<string>();

    await Promise.all(targets.map(async (t: any) => {
      broadcastIds.add(t.broadcast_id);
      try {
        const { data: bc } = await supabase
          .from("broadcasts").select("flow_id, status, min_interval_seconds, max_interval_seconds")
          .eq("id", t.broadcast_id).maybeSingle();

        if (!bc) {
          await supabase.from("broadcast_targets").update({
            status: "skipped", processed_at: new Date().toISOString(),
            error_message: "broadcast removido",
          }).eq("id", t.id);
          return;
        }
        const status = (bc as any).status;
        if (status === "cancelled") {
          await supabase.from("broadcast_targets").update({
            status: "skipped", processed_at: new Date().toISOString(),
            error_message: "broadcast cancelado",
          }).eq("id", t.id);
          return;
        }
        if (status === "paused") {
          await supabase.from("broadcast_targets").update({ status: "pending" }).eq("id", t.id);
          return;
        }

        const { data: lead } = await supabase
          .from("leads").select("status").eq("id", t.lead_id).maybeSingle();
        if (!lead || (lead as any).status !== "active") {
          await supabase.from("broadcast_targets").update({
            status: "skipped", processed_at: new Date().toISOString(),
            error_message: "lead inativo",
          }).eq("id", t.id);
          return;
        }

        const { data: activeState } = await supabase
          .from("lead_funnel_states").select("id")
          .eq("lead_id", t.lead_id).eq("status", "active").maybeSingle();
        if (activeState) {
          const newAt = new Date(Date.now() + ((bc as any).max_interval_seconds || 60) * 1000).toISOString();
          await supabase.from("broadcast_targets").update({
            status: "pending", scheduled_at: newAt,
            error_message: "aguardando funil ativo do lead",
          }).eq("id", t.id);
          reschedule++;
          return;
        }

        await executeFlowForLead(supabase, { lead_id: t.lead_id, flow_id: (bc as any).flow_id });
        await supabase.from("broadcast_targets").update({
          status: "sent", processed_at: new Date().toISOString(),
        }).eq("id", t.id);
        dispatched++;
      } catch (err) {
        await supabase.from("broadcast_targets").update({
          status: "failed", processed_at: new Date().toISOString(),
          error_message: String(err),
        }).eq("id", t.id);
        failed++;
      }
    }));

    await checkCompleted(supabase, broadcastIds);
    return new Response(JSON.stringify({ dispatched, failed, reschedule }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
