import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const body = await req.json();
    const { flow_id, tag_id } = body;
    const minS = Math.max(1, Number(body.min_interval_seconds || 30));
    const maxS = Math.max(minS, Number(body.max_interval_seconds || 90));
    if (!flow_id || !tag_id) {
      return new Response(JSON.stringify({ error: "missing flow_id/tag_id" }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Resolve operation from the selected flow → operations.instance_name.
    const { data: flowRow, error: flowErr } = await supabase
      .from("flows").select("operation_id").eq("id", flow_id).maybeSingle();
    if (flowErr || !flowRow) {
      return new Response(JSON.stringify({ error: "flow not found" }), { status: 400, headers: cors });
    }
    const operationId = (flowRow as any).operation_id as string | null;
    let instanceName: string | null = null;
    if (operationId) {
      const { data: opRow } = await supabase
        .from("operations").select("instance_name").eq("id", operationId).maybeSingle();
      instanceName = (opRow as any)?.instance_name || null;
    }
    if (!instanceName) instanceName = Deno.env.get("EVOLUTION_INSTANCE_NAME") || null;
    console.log(`[broadcast-start] flow=${flow_id} op=${operationId} instance=${instanceName}`);

    const { data: leadTags, error: ltError } = await supabase
      .from("lead_tags").select("lead_id").eq("tag_id", tag_id);
    if (ltError) throw new Error(ltError.message);

    const leadIds = Array.from(new Set((leadTags || []).map((r: any) => r.lead_id)));
    if (leadIds.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum lead encontrado para essa etiqueta" }), { status: 400, headers: cors });
    }

    // Scope leads to the same operation as the flow to keep operations isolated.
    const leadsQuery = supabase
      .from("leads").select("id, status, operation_id").in("id", leadIds);
    const { data: leads, error: leadsError } = operationId
      ? await leadsQuery.eq("operation_id", operationId)
      : await leadsQuery;
    if (leadsError) throw new Error(leadsError.message);
    const activeIds = (leads || []).filter((l: any) => l.status === "active").map((l: any) => l.id);
    if (activeIds.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum lead ativo para essa etiqueta" }), { status: 400, headers: cors });
    }

    const bcInsert: any = {
      name: body.name || "Disparo",
      flow_id, tag_id,
      min_interval_seconds: minS,
      max_interval_seconds: maxS,
      total_leads: activeIds.length,
      status: "running",
      started_at: new Date().toISOString(),
    };
    if (operationId) bcInsert.operation_id = operationId;
    const { data: bc, error: bcError } = await supabase
      .from("broadcasts").insert(bcInsert).select("id").single();
    if (bcError) throw new Error(bcError.message);

    let cursorMs = Date.now();
    const nowIso = new Date().toISOString();
    // Sequential queue: only the first lead is scheduled to run now.
    // The rest are parked far in the future and will be released by the
    // dispatcher after the previous lead's funnel messages finish.
    const FAR_FUTURE_BASE = new Date("2999-01-01T00:00:00Z").getTime();
    const rows = activeIds.map((lead_id: string, idx: number) => ({
      broadcast_id: bc!.id,
      lead_id,
      scheduled_at: idx === 0
        ? nowIso
        : new Date(FAR_FUTURE_BASE + idx * 1000).toISOString(),
      status: "pending",
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const { error } = await supabase.from("broadcast_targets").insert(slice);
      if (error) throw new Error(error.message);
    }

    return new Response(JSON.stringify({ broadcast_id: bc!.id, total: activeIds.length }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
