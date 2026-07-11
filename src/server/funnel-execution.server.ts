import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getOperationInstance } from "@/server/operations.server";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function assertNoError(error: { message?: string } | null | undefined, context: string) {
  if (error) throw new Error(`${context}: ${error.message || "erro desconhecido"}`);
}

// ────────────────────────────────────────────────────────────────────
// MOTOR DO BUILDER 2D
// Caminha o grafo (funnel_blocks/actions/edges/ab_outputs) a partir do
// bloco inicial e converte tudo em linhas de scheduled_messages com
// send_at pré-calculado — reutiliza o scheduler existente (pg_cron +
// message-dispatcher), nenhum scheduler paralelo.
//   • Ação delay: avança o cursor de tempo (s/m/h) — espera real.
//   • Ação tag:   vira linha "tag_action" (o dispatcher aplica no CRM).
//   • Fim do bloco: segue a edge para o próximo nó.
//   • Nó A/B: sorteia UMA saída conforme os pesos e segue aquela edge.
// ────────────────────────────────────────────────────────────────────
const DELAY_UNIT_MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
};

async function buildCanvasRows({
  funnel_id,
  operation_id,
  lead_id,
  blocks,
  cursorStartMs,
  instanceName,
  targetNumber,
  startBlockId,
}: {
  funnel_id: string;
  operation_id: string;
  lead_id: string;
  blocks: any[];
  cursorStartMs: number;
  instanceName: string;
  targetNumber: string;
  startBlockId: string | null;
}): Promise<any[]> {
  const blockIds = blocks.map((b) => b.id);

  const [aRes, eRes, oRes] = await Promise.all([
    supabaseAdmin
      .from("funnel_actions" as any)
      .select("*")
      .eq("operation_id", operation_id)
      .in("block_id", blockIds)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("funnel_edges" as any)
      .select("*")
      .eq("funnel_id", funnel_id)
      .eq("operation_id", operation_id),
    supabaseAdmin
      .from("funnel_ab_outputs" as any)
      .select("*")
      .eq("operation_id", operation_id)
      .in("block_id", blockIds),
  ]);
  assertNoError(aRes.error, "canvas actions lookup failed");
  assertNoError(eRes.error, "canvas edges lookup failed");
  assertNoError(oRes.error, "canvas ab outputs lookup failed");

  const actions = (aRes.data || []) as any[];
  const edges = (eRes.data || []) as any[];
  const abOutputs = (oRes.data || []) as any[];

  const blockById = new Map(blocks.map((b) => [b.id, b]));

  // Bloco inicial: fonte da verdade é o nó "Início" do canvas
  // (funnels.start_block_id). Fallback (funis de canvas antigos, sem o
  // Início conectado): deduz pelo bloco que NÃO recebe nenhuma edge; se
  // houver mais de um (grafo desconexo), o mais antigo; se nenhum
  // (ciclo), o mais antigo do funil.
  let start: any = startBlockId ? blockById.get(startBlockId) : null;
  if (!start) {
    const targets = new Set(edges.map((e) => e.target_block_id));
    const roots = blocks
      .filter((b) => !targets.has(b.id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    start =
      roots[0] ||
      [...blocks].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    if (start) {
      console.warn(
        `[canvas-engine] funil ${funnel_id} sem nó Início conectado — usando dedução (bloco ${start.id})`,
      );
    }
  }
  if (!start) return [];

  const rows: any[] = [];
  const visited = new Set<string>();
  let cursorMs = cursorStartMs;
  let current: any = start;

  while (current) {
    if (visited.has(current.id)) {
      console.warn(`[canvas-engine] ciclo detectado no funil ${funnel_id} (bloco ${current.id}) — encerrando caminho`);
      break;
    }
    visited.add(current.id);

    if (current.node_type === "ab_split") {
      // Sorteia UMA saída conforme os pesos (iguais por padrão = 1/N).
      const outs = abOutputs
        .filter((o) => o.block_id === current.id)
        .sort((a, b) => a.output_index - b.output_index);
      if (outs.length === 0) break;
      const total = outs.reduce((s, o) => s + Number(o.weight || 1), 0);
      let r = Math.random() * total;
      let chosen = outs[outs.length - 1];
      for (const o of outs) {
        r -= Number(o.weight || 1);
        if (r <= 0) {
          chosen = o;
          break;
        }
      }
      console.log(
        `[canvas-engine] A/B ${current.id}: sorteada saída ${chosen.output_index} de ${outs.length}`,
      );
      const edge = edges.find(
        (e) => e.source_block_id === current.id && e.source_handle === `out-${chosen.output_index}`,
      );
      current = edge ? blockById.get(edge.target_block_id) : null;
      continue;
    }

    // Bloco comum: roda as ações em ordem (order_index).
    const blockActions = actions
      .filter((a) => a.block_id === current.id)
      .sort((a, b) => a.order_index - b.order_index);

    for (const action of blockActions) {
      const cfg = action.config || {};
      if (action.type === "delay") {
        const unitMs = DELAY_UNIT_MS[cfg.unit || "seconds"] || 1000;
        cursorMs += Math.max(0, Number(cfg.value || 0)) * unitMs;
        continue;
      }
      if (action.type === "tag") {
        rows.push({
          lead_id,
          funnel_id,
          instance_name: instanceName,
          whatsapp_number: targetNumber,
          message_type: "tag_action",
          content: JSON.stringify({ tag_id: cfg.tag_id, tag_operation: cfg.tag_operation }),
          send_at: new Date(cursorMs).toISOString(),
          status: "pending",
        });
        continue;
      }
      // texto / audio / imagem / video / documento
      rows.push({
        lead_id,
        funnel_id,
        instance_name: instanceName,
        whatsapp_number: targetNumber,
        message_type: action.type,
        content: cfg.content ?? null,
        media_url: cfg.media_url ?? null,
        file_name: cfg.file_name ?? null,
        mimetype: cfg.mimetype ?? null,
        caption: cfg.caption ?? null,
        send_at: new Date(cursorMs).toISOString(),
        status: "pending",
      });
    }

    // Fim do bloco: segue a edge (saída única → source_handle null).
    const edge = edges.find((e) => e.source_block_id === current.id && !e.source_handle);
    current = edge ? blockById.get(edge.target_block_id) : null;
  }

  return rows;
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

  // ISOLAMENTO: funil e lead precisam ser da MESMA operação. A UI já impede
  // (listas escopadas), mas isto barra qualquer caminho indireto (fluxo mal
  // configurado, chamada manual de API) de disparar funil de um projeto
  // para lead de outro.
  const leadOpId = (lead as any).operation_id;
  const funnelOpId0 = (funnel as any).operation_id;
  if (leadOpId && funnelOpId0 && leadOpId !== funnelOpId0) {
    console.error(
      `[funnel] BLOQUEADO: funil ${funnel_id} (op=${funnelOpId0}) não pertence à operação do lead ${lead_id} (op=${leadOpId})`,
    );
    return { scheduled: 0, skipped: "cross_operation_blocked" };
  }

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

  // TRAVA ANTI-LOOP: não reexecuta o mesmo funil para o mesmo lead se ele já
  // rodou nas últimas 24h. Sem isso, gatilho/keyword repetido ou reconexão
  // podem reagendar o funil dezenas de vezes (foi o que mandou 251 mensagens
  // para um único lead e ajudou a gerar o bloqueio do número).
  const { data: recentState, error: recentErr } = await supabaseAdmin
    .from("lead_funnel_states")
    .select("started_at")
    .eq("lead_id", lead_id)
    .eq("funnel_id", funnel_id)
    .gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1);
  assertNoError(recentErr, "recent funnel state lookup failed");
  if ((recentState?.length || 0) > 0) {
    console.log(`[funnel] anti-loop: funil ${funnel_id} já rodou para lead ${lead_id} nas últimas 24h — ignorando`);
    return { scheduled: 0, skipped: "recent_run_24h" };
  }

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

  const triggerMs = new Date(trigger_time ?? Date.now()).getTime();
  const startDelayMin = rand((funnel as any).start_min ?? 0, (funnel as any).start_max ?? 0);
  const cursorStartMs = triggerMs + startDelayMin * 60_000;
  const instanceName =
    opInstance || lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "cland-main";
  const targetNumber = lead.remote_jid || lead.whatsapp_number;

  // ───── Estrutura nova (builder 2D)? Se o funil tem blocos no canvas,
  // caminha o grafo. Senão, cai no caminho legado (funnel_steps). ─────
  const funnelOpId = (funnel as any).operation_id;
  const { data: canvasBlocks, error: cbErr } = await supabaseAdmin
    .from("funnel_blocks" as any)
    .select("*")
    .eq("funnel_id", funnel_id)
    .eq("operation_id", funnelOpId);
  assertNoError(cbErr, "canvas blocks lookup failed");

  let rows: any[] = [];

  if ((canvasBlocks?.length || 0) > 0) {
    rows = await buildCanvasRows({
      funnel_id,
      operation_id: funnelOpId,
      lead_id,
      blocks: canvasBlocks as any[],
      cursorStartMs,
      instanceName,
      targetNumber,
      startBlockId: (funnel as any).start_block_id ?? null,
    });
  } else {
    // ───── Caminho LEGADO: passos numerados (funnel_steps) ─────
    const { data: steps, error: stepsError } = await supabaseAdmin
      .from("funnel_steps")
      .select("*")
      .eq("funnel_id", funnel_id)
      .order("order_index", { ascending: true });
    assertNoError(stepsError, "funnel steps lookup failed");
    if (!steps || steps.length === 0) throw new Error("no steps");

    let cursorMs = cursorStartMs;
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
        instance_name: instanceName,
        whatsapp_number: targetNumber,
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
