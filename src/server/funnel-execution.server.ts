import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getOperationInstance } from "@/server/operations.server";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function assertNoError(error: { message?: string } | null | undefined, context: string) {
  if (error) throw new Error(`${context}: ${error.message || "erro desconhecido"}`);
}

export async function scheduleFunnelForLead({
  lead_id,
  funnel_id,
  trigger_time,
}: {
  lead_id: string;
  funnel_id: string;
  trigger_time?: string;
}) {
  if (!lead_id || !funnel_id) throw new Error("missing lead_id/funnel_id");

  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("whatsapp_number, remote_jid, instance_name, operation_id")
    .eq("id", lead_id)
    .maybeSingle();
  assertNoError(leadError, "lead lookup failed");
  if (!lead) throw new Error("lead not found");
  const opInstance = await getOperationInstance((lead as any).operation_id);

  const { data: funnel, error: funnelError } = await supabaseAdmin
    .from("funnels")
    .select("*")
    .eq("id", funnel_id)
    .maybeSingle();
  assertNoError(funnelError, "funnel lookup failed");
  if (!funnel) throw new Error("funnel not found");

  // Se há mensagens realmente pendentes/dispatching, pula
  const { data: pendingMessages, error: pendingError } = await supabaseAdmin
    .from("scheduled_messages")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("funnel_id", funnel_id)
    .in("status", ["pending", "dispatching"])
    .limit(1);
  assertNoError(pendingError, "pending scheduled messages lookup failed");
  if ((pendingMessages?.length || 0) > 0) return { scheduled: 0, skipped: "already_pending" };

  // Se há estado ativo mas SEM pendentes, fecha o estado anterior e segue
  const { data: activeStates, error: activeStateError } = await supabaseAdmin
    .from("lead_funnel_states")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("funnel_id", funnel_id)
    .eq("status", "active");
  assertNoError(activeStateError, "lead funnel active state lookup failed");
  if ((activeStates?.length || 0) > 0) {
    const ids = activeStates!.map((s: any) => s.id);
    const { error: closeErr } = await supabaseAdmin
      .from("lead_funnel_states")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .in("id", ids);
    assertNoError(closeErr, "closing stale active funnel state failed");
  }

  const { data: steps, error: stepsError } = await supabaseAdmin
    .from("funnel_steps")
    .select("*")
    .eq("funnel_id", funnel_id)
    .order("order_index", { ascending: true });
  assertNoError(stepsError, "funnel steps lookup failed");
  if (!steps || steps.length === 0) throw new Error("no steps");

  const triggerMs = new Date(trigger_time ?? Date.now()).getTime();
  const startDelayMin = rand((funnel as any).start_min ?? 0, (funnel as any).start_max ?? 0);
  let cursorMs = triggerMs + startDelayMin * 60_000;

  const rows: any[] = [];
  for (const step of steps as any[]) {
    if (step.type === "Delay") {
      const isFixed = step.delay_type === "fixed" || step.delay_type === "fixo";
      const delaySec = isFixed
        ? (step.delay_fixed ?? 30)
        : rand(step.delay_min ?? 20, step.delay_max ?? 120);
      cursorMs += delaySec * 1000;
      continue;
    }

    rows.push({
      lead_id,
      funnel_id,
      step_id: step.id,
      instance_name: opInstance || lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "cland-main",
      whatsapp_number: lead.remote_jid || lead.whatsapp_number,
      message_type: step.type,
      content: step.content,
      media_url: step.media_url,
      file_name: step.file_name,
      mimetype: step.mimetype,
      caption: step.caption,
      send_at: new Date(cursorMs).toISOString(),
      status: "pending",
    });
  }
  if (rows.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("scheduled_messages").insert(rows);
    assertNoError(insertError, "scheduled messages insert failed");
  }

  const { error: stateError } = await supabaseAdmin.from("lead_funnel_states").upsert(
    {
      lead_id,
      funnel_id,
      status: "active",
      started_at: new Date().toISOString(),
    },
    { onConflict: "lead_id,funnel_id" },
  );
  assertNoError(stateError, "lead funnel state upsert failed");

  return { scheduled: rows.length };
}

export async function executeFlowForLead({
  lead_id,
  flow_id,
  start_block_index = 0,
}: {
  lead_id: string;
  flow_id: string;
  start_block_index?: number;
}): Promise<Record<string, unknown>> {
  if (!lead_id || !flow_id) throw new Error("missing lead_id/flow_id");

  // Se já existe um agente ativo para este lead, não reativar o fluxo
  // (apenas permite quando estamos retomando explicitamente em um bloco > 0,
  // o que indica que o agente já finalizou).
  if (!start_block_index) {
    const { data: existingAgent } = await supabaseAdmin
      .from("lead_active_agents" as any)
      .select("id")
      .eq("lead_id", lead_id)
      .maybeSingle();
    if (existingAgent) {
      console.log(`[flow-executor] agente já ativo para lead=${lead_id}, ignorando ativação de fluxo ${flow_id}`);
      return { ok: true, status: "agent_active" };
    }
  }

  const { data: blocks, error: blocksError } = await supabaseAdmin
    .from("flow_blocks")
    .select("*")
    .eq("flow_id", flow_id)
    .order("order_index", { ascending: true });
  assertNoError(blocksError, "flow blocks lookup failed");

  if (!blocks || blocks.length === 0) return { ok: true, msg: "no blocks" };

  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("whatsapp_number, remote_jid, instance_name, operation_id")
    .eq("id", lead_id)
    .maybeSingle();
  assertNoError(leadError, "lead lookup failed");
  if (!lead) throw new Error("lead not found");
  const opInstance = await getOperationInstance((lead as any).operation_id);

  const now = new Date();

  for (let i = start_block_index; i < blocks.length; i++) {
    const block: any = blocks[i];

    if (block.block_type === "funnel" && block.reference_id) {
      const result = await scheduleFunnelForLead({
        lead_id,
        funnel_id: block.reference_id,
        trigger_time: now.toISOString(),
      });
      console.log(`[flow-executor] scheduled funnel ${block.reference_id} for lead ${lead_id}: ${result.scheduled}`);

      // Pausa o fluxo: agenda flow_resume 10s após a última mensagem do funil
      // para retomar o fluxo no próximo bloco quando o funil terminar.
      const { data: lastMsg } = await supabaseAdmin
        .from("scheduled_messages")
        .select("send_at")
        .eq("lead_id", lead_id)
        .eq("funnel_id", block.reference_id)
        .neq("message_type", "flow_resume")
        .order("send_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const baseMs = lastMsg?.send_at ? new Date(lastMsg.send_at).getTime() : now.getTime();
      const resumeAt = new Date(baseMs + 10_000).toISOString();

      const { error: resumeErr } = await supabaseAdmin.from("scheduled_messages").insert({
        lead_id,
        funnel_id: block.reference_id,
        instance_name: opInstance || lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "",
        whatsapp_number: lead.remote_jid || lead.whatsapp_number,
        message_type: "flow_resume",
        content: JSON.stringify({ flow_id, resume_block_index: i + 1 }),
        send_at: resumeAt,
        status: "pending",
      });
      assertNoError(resumeErr, "flow resume after funnel scheduling failed");
      return { ok: true, paused: "funnel_running" };
    } else if (block.block_type === "agent" && block.reference_id) {
      // Modo passivo: registra que o agente está ativo para esse lead
      // e PARA o fluxo. Nada é enviado agora — o agente só vai responder
      // quando o lead enviar uma mensagem (ver webhook-whatsapp).
      const { error: assignErr } = await supabaseAdmin
        .from("leads")
        .update({ current_agent_id: block.reference_id })
        .eq("id", lead_id);
      assertNoError(assignErr, "agent assignment failed");

      // Captura mensagens que o lead enviou DURANTE o funil, antes do agente
      // ativar (race condition: a pergunta chega no intervalo entre o fim do
      // funil e a ativação do agente). Sem isso, essa pergunta fica sem
      // resposta para sempre, pois o agente é passivo e só reage a mensagens
      // novas. Pegamos tudo que o lead disse após a última mensagem nossa.
      const { data: lastOut } = await supabaseAdmin
        .from("messages")
        .select("sent_at")
        .eq("lead_id", lead_id)
        .eq("direction", "outbound")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const since = (lastOut as any)?.sent_at || new Date(0).toISOString();
      const { data: pend } = await supabaseAdmin
        .from("messages")
        .select("content")
        .eq("lead_id", lead_id)
        .eq("direction", "inbound")
        .gt("sent_at", since)
        .order("sent_at", { ascending: true });
      const pendingText = (pend || [])
        .map((m: any) => m.content)
        .filter((c: any) => !!c)
        .join("\n");

      const { error: activeErr } = await supabaseAdmin
        .from("lead_active_agents" as any)
        .upsert(
          {
            lead_id,
            agent_id: block.reference_id,
            flow_id,
            flow_block_id: block.id,
            resume_block_index: i + 1,
            turn_count: 0,
            started_at: new Date().toISOString(),
            // Se houver pergunta pendente do funil, já deixa no buffer para o
            // cron de agentes responder no próximo ciclo.
            pending_messages: pendingText || "",
            last_message_at: pendingText ? new Date().toISOString() : null,
          },
          { onConflict: "lead_id" } as any,
        );
      assertNoError(activeErr, "lead_active_agents upsert failed");

      console.log(
        `[flow-executor] agent ${block.reference_id} ativado para lead ${lead_id} | pendentes do funil="${pendingText.substring(0, 80)}"`,
      );
      return { ok: true, paused: "agent_listening" };
    } else if (block.block_type === "tag_assign" && block.reference_id) {
      const { error } = await supabaseAdmin.from("lead_tags").upsert(
        { lead_id, tag_id: block.reference_id, assigned_by: "flow" },
        { onConflict: "lead_id,tag_id" } as any,
      );
      assertNoError(error, "tag assignment failed");
    } else if (block.block_type === "tag_remove" && block.reference_id) {
      const { error } = await supabaseAdmin
        .from("lead_tags")
        .delete()
        .eq("lead_id", lead_id)
        .eq("tag_id", block.reference_id);
      assertNoError(error, "tag removal failed");
    } else if (block.block_type === "wait" && block.wait_minutes > 0) {
      const resumeAt = new Date(now.getTime() + block.wait_minutes * 60_000);
      const { error } = await supabaseAdmin.from("scheduled_messages").insert({
        lead_id,
        instance_name: opInstance || lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "",
        whatsapp_number: lead.remote_jid || lead.whatsapp_number,
        message_type: "flow_resume",
        content: JSON.stringify({ flow_id, resume_block_index: i + 1 }),
        send_at: resumeAt.toISOString(),
        status: "pending",
      });
      assertNoError(error, "flow resume scheduling failed");
      break;
    } else if (block.block_type === "condition") {
      let met = false;

      if (block.condition_type === "sent_comprovante") {
        const { data, error } = await supabaseAdmin
          .from("comprovantes" as any)
          .select("id")
          .eq("lead_id", lead_id)
          .eq("status", "confirmado")
          .limit(1);
        assertNoError(error, "receipt condition lookup failed");
        met = (data?.length || 0) > 0;
      } else if (block.condition_type === "has_tag" && block.condition_value) {
        const { data, error } = await supabaseAdmin
          .from("lead_tags")
          .select("id")
          .eq("lead_id", lead_id)
          .eq("tag_id", block.condition_value)
          .limit(1);
        assertNoError(error, "tag condition lookup failed");
        met = (data?.length || 0) > 0;
      } else if (block.condition_type === "replied") {
        const { data, error } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("lead_id", lead_id)
          .eq("direction", "inbound")
          .limit(1);
        assertNoError(error, "reply condition lookup failed");
        met = (data?.length || 0) > 0;
      } else if (block.condition_type === "keyword" && block.condition_value) {
        const { data, error } = await supabaseAdmin
          .from("messages")
          .select("content")
          .eq("lead_id", lead_id)
          .eq("direction", "inbound")
          .ilike("content", `%${block.condition_value}%`)
          .limit(1);
        assertNoError(error, "keyword condition lookup failed");
        met = (data?.length || 0) > 0;
      }

      if (!met && block.branch_no_block_id) {
        const idx = blocks.findIndex((candidate: any) => candidate.id === block.branch_no_block_id);
        if (idx >= 0) {
          await executeFlowForLead({ lead_id, flow_id, start_block_index: idx });
          return { ok: true, branched: "no" };
        }
        return { ok: true, ended: true };
      }
    }
  }

  return { ok: true };
}
