import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLLM, type ChatMsg, type LLMConfig, type Provider } from "./llm-providers.server";

const COMPLETION_MARK = "[AGENTE_CONCLUIDO]";

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

/**
 * Executa o agente para um lead.
 * SEMPRE chamado em resposta a uma mensagem inbound do lead — nunca
 * proativamente a partir do flow-executor (que apenas registra o agente
 * como ativo e para o fluxo).
 */
export async function executeAgentForLead(
  agentId: string,
  leadId: string,
  incomingMessage: string,
): Promise<{ shouldContinue: boolean; response: string | null; reason?: string }> {
  console.log(`[agent] iniciando execução | agent=${agentId} | lead=${leadId} | incoming="${(incomingMessage || "").substring(0, 200)}"`);
  try {
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("agents")
    .select("id, name, objective, product, tone, exit_condition, prompt, exit_tags, is_active, llm_connection_id, max_turns")
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr) throw new Error(`agent lookup: ${agentErr.message}`);
  if (!agent) throw new Error("agent not found");

  const llmId = (agent as any).llm_connection_id as string | null;
  if (!llmId) throw new Error("agente sem conexão LLM configurada");

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("llm_connections" as any)
    .select("id, provider, api_key, model, max_tokens, temperature, is_active")
    .eq("id", llmId)
    .maybeSingle();
  if (connErr) throw new Error(`llm conn lookup: ${connErr.message}`);
  if (!conn) throw new Error("conexão LLM não encontrada");
  console.log(`[agent] conexão LLM carregada | provider=${(conn as any).provider} | model=${(conn as any).model}`);

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads").select("id, name, push_name, whatsapp_number, remote_jid, instance_name")
    .eq("id", leadId).maybeSingle();
  if (leadErr) throw new Error(`lead lookup: ${leadErr.message}`);
  if (!lead) throw new Error("lead not found");

  const { data: activeRow } = await supabaseAdmin
    .from("lead_active_agents" as any)
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  const currentTurn = ((activeRow as any)?.turn_count ?? 0) as number;
  const maxTurns = ((agent as any).max_turns ?? 20) as number;

  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("direction, content, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false })
    .limit(20);
  const orderedHistory = (history || []).slice().reverse();
  console.log(`[agent] histórico carregado | ${orderedHistory.length} mensagens | turn=${currentTurn}/${maxTurns}`);

  const leadName = lead.name || lead.push_name || "Cliente";
  const conversationHistory = orderedHistory
    .map((m: any) => `${m.direction === "inbound" ? "Cliente" : "Agente"}: ${m.content || ""}`)
    .join("\n");

  const vars: Record<string, string> = {
    lead_name: leadName,
    product: (agent as any).product || "",
    objective: (agent as any).objective || "",
    conversation_history: conversationHistory,
  };

  const userPrompt = renderTemplate((agent as any).prompt || "", vars);
  const systemPrompt = `Você é um assistente de vendas responsável por uma etapa específica da jornada de compra.

Objetivo desta etapa: ${(agent as any).objective || ""}
Produto: ${(agent as any).product || ""}
Tom de comunicação: ${(agent as any).tone || "Misto"}

Contexto da conversa até agora:
${conversationHistory}

Suas instruções específicas:
${userPrompt}

Condição para encerrar sua atuação: ${(agent as any).exit_condition || ""}

REGRAS IMPORTANTES:
- Responda sempre em português brasileiro
- Seja completamente natural e humano na comunicação
- Nunca pareça um robô ou sistema automatizado
- Nunca mencione que é uma IA a menos que o cliente pergunte diretamente
- Mantenha o contexto de toda a conversa ao responder
- Quando a condição de saída for atingida, encerre com: ${COMPLETION_MARK}
- Se o lead demonstrar claramente que não quer continuar, encerre com: ${COMPLETION_MARK}
- Nunca invente informações sobre o produto — use apenas o que foi especificado`;

  const chatMessages: ChatMsg[] = orderedHistory.map((m: any) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
  if (incomingMessage) chatMessages.push({ role: "user", content: incomingMessage });

  const cfg: LLMConfig = {
    provider: (conn as any).provider as Provider,
    api_key: (conn as any).api_key,
    model: (conn as any).model,
    max_tokens: (conn as any).max_tokens ?? 1000,
    temperature: Number((conn as any).temperature ?? 0.7),
  };

  console.log(`[agent] chamando LLM...`);
  const raw = await callLLM(cfg, systemPrompt, chatMessages);
  let completed = raw.includes(COMPLETION_MARK);
  const text = raw.replace(COMPLETION_MARK, "").trim();
  console.log(`[agent] resposta LLM recebida | completed=${completed} | text="${text.substring(0, 100)}"`);

  // Avaliação explícita da condição de saída via segunda chamada leve ao LLM
  if (!completed && (agent as any).exit_condition) {
    try {
      const recentInbound = orderedHistory
        .filter((m: any) => m.direction === "inbound")
        .slice(-3)
        .map((m: any) => m.content || "");
      const exitMet = await evaluateExitCondition(
        (agent as any).exit_condition,
        [...recentInbound, incomingMessage].filter(Boolean),
        cfg,
      );
      if (exitMet) {
        completed = true;
        console.log(`[agent] condição de saída atingida via avaliação explícita`);
      }
    } catch (e) {
      console.warn(`[agent] avaliação de condição de saída falhou:`, e);
    }
  }

  if (text) {
    console.log(`[agent] enviando resposta via Evolution...`);
    await sendOutgoing(lead, text);
    console.log(`[agent] resposta enviada com sucesso`);
  }

  const newTurn = currentTurn + 1;
  const reachedMax = newTurn >= maxTurns;
  if (!completed && reachedMax) completed = true;

  if (completed) {
    await finishAgent(agentId, leadId, activeRow);
    return {
      shouldContinue: true,
      response: text,
      reason: reachedMax ? "max_turns" : "completed",
    };
  }

  if (activeRow) {
    await supabaseAdmin
      .from("lead_active_agents" as any)
      .update({ turn_count: newTurn })
      .eq("lead_id", leadId);
  }

  return { shouldContinue: false, response: text };
  } catch (error) {
    console.error(`[agent] ERRO em executeAgentForLead:`, error);
    throw error;
  }
}

async function evaluateExitCondition(
  exitCondition: string,
  lastLeadMessages: string[],
  cfg: LLMConfig,
): Promise<boolean> {
  if (!exitCondition || lastLeadMessages.length === 0) return false;
  const evalPrompt = `Analise as últimas mensagens do cliente e determine se a seguinte condição foi atingida.

Condição de saída: "${exitCondition}"

Últimas mensagens do cliente:
${lastLeadMessages.map((m, i) => `${i + 1}. "${m}"`).join("\n")}

Responda APENAS com: SIM ou NAO`;
  const result = await callLLM(cfg, evalPrompt, [
    { role: "user", content: "Avalie a condição." },
  ]);
  return result.trim().toUpperCase().startsWith("SIM");
}

async function finishAgent(agentId: string, leadId: string, activeRow: any) {
  console.log(`[agent] finalizando agente | agent=${agentId} | lead=${leadId}`);
  const { data: agent } = await supabaseAdmin
    .from("agents").select("exit_tags").eq("id", agentId).maybeSingle();
  await applyExitTags(leadId, ((agent as any)?.exit_tags || []) as string[]);
  console.log(`[agent] exit_tags aplicadas (${((agent as any)?.exit_tags || []).length})`);

  await supabaseAdmin.from("lead_active_agents" as any).delete().eq("lead_id", leadId);
  await supabaseAdmin.from("leads").update({ current_agent_id: null }).eq("id", leadId);
  console.log(`[agent] estado limpo`);

  const flowId = activeRow?.flow_id as string | undefined;
  const resumeIdx = activeRow?.resume_block_index as number | undefined;
  if (flowId && typeof resumeIdx === "number") {
    console.log(`[agent] retomando fluxo=${flowId} no bloco=${resumeIdx}`);
    try {
      const { executeFlowForLead } = await import("./funnel-execution.server");
      const result = await executeFlowForLead({ lead_id: leadId, flow_id: flowId, start_block_index: resumeIdx });
      console.log(`[agent] fluxo retomado | resultado:`, result);
    } catch (e) {
      console.warn("[agent] flow resume failed:", e);
    }
  } else {
    console.log(`[agent] nenhum próximo bloco — fluxo encerrado`);
  }
}

async function applyExitTags(leadId: string, tagIds: string[]) {
  if (!tagIds || tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ lead_id: leadId, tag_id, assigned_by: "agent" }));
  await supabaseAdmin.from("lead_tags").upsert(rows, { onConflict: "lead_id,tag_id" } as any);
}

async function sendOutgoing(lead: any, text: string) {
  await supabaseAdmin.from("messages").insert({
    lead_id: lead.id,
    direction: "outbound",
    type: "text",
    content: text,
    sent_by: "agent",
    is_ai: true,
  });

  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME;
  const number = lead.remote_jid || lead.whatsapp_number;
  if (!baseUrl || !apiKey || !instance || !number) return;

  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text }),
    });
  } catch (e) {
    console.warn("[agent] evolution send failed:", e);
  }
}

const AGENT_DEBOUNCE_MS = 30_000;

/**
 * Verifica se há um agente ativo para o lead. Se sim, agenda (ou
 * reagenda) um processamento de agente em 30 segundos. Não chama o
 * LLM imediatamente — isso permite acumular várias mensagens rápidas
 * do lead em uma única resposta.
 *
 * Retorna true se há um agente ativo (e o caller deve pular os fluxos
 * normais), false caso contrário.
 */
export async function handleInboundForActiveAgent(
  leadId: string,
  _incomingMessage: string | null,
): Promise<boolean> {
  const { data: active } = await supabaseAdmin
    .from("lead_active_agents" as any)
    .select("agent_id, flow_id, resume_block_index")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!active) return false;

  console.log(`[agent] inbound recebido com agente ativo | lead=${leadId} | agendando timer 30s`);

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("whatsapp_number, remote_jid, instance_name")
    .eq("id", leadId)
    .maybeSingle();

  // Cancela timer pendente anterior (se houver) para "reiniciar" os 30s.
  const { error: cancelErr } = await supabaseAdmin
    .from("scheduled_messages")
    .update({ status: "cancelled" })
    .eq("lead_id", leadId)
    .eq("message_type", "agent_process")
    .eq("status", "pending");
  if (cancelErr) console.warn("[agent] cancel pending agent_process failed:", cancelErr);

  const sendAt = new Date(Date.now() + AGENT_DEBOUNCE_MS).toISOString();
  const { error: insErr } = await supabaseAdmin.from("scheduled_messages").insert({
    lead_id: leadId,
    message_type: "agent_process",
    content: JSON.stringify({
      agent_id: (active as any).agent_id,
      flow_id: (active as any).flow_id,
      resume_block_index: (active as any).resume_block_index,
    }),
    instance_name:
      (lead as any)?.instance_name || process.env.EVOLUTION_INSTANCE_NAME || "",
    whatsapp_number: (lead as any)?.remote_jid || (lead as any)?.whatsapp_number || "",
    send_at: sendAt,
    status: "pending",
  });
  if (insErr) {
    console.error("[agent] failed to schedule agent_process:", insErr);
    return true; // ainda é "tratado pelo agente" — não dispare fluxos
  }

  console.log(`[agent] timer agendado para ${sendAt}`);
  return true;
}

/**
 * Executado pelo message-dispatcher quando um scheduled_messages do tipo
 * "agent_process" amadurece. Concatena todas as mensagens inbound desde
 * a última resposta do agente e envia ao LLM como uma única entrada.
 */
export async function processAgentTimer(payload: {
  agent_id: string;
  lead_id: string;
}): Promise<void> {
  const { agent_id, lead_id } = payload;
  console.log(`[agent] processAgentTimer | agent=${agent_id} | lead=${lead_id}`);

  // Confirma que o agente ainda está ativo (pode ter sido finalizado).
  const { data: active } = await supabaseAdmin
    .from("lead_active_agents" as any)
    .select("agent_id")
    .eq("lead_id", lead_id)
    .maybeSingle();
  if (!active) {
    console.log(`[agent] timer expirou mas agente não está mais ativo — ignorando`);
    return;
  }

  // Última resposta do agente para esse lead — corte temporal.
  const { data: lastOutbound } = await supabaseAdmin
    .from("messages")
    .select("sent_at")
    .eq("lead_id", lead_id)
    .eq("direction", "outbound")
    .eq("sent_by", "agent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = (lastOutbound as any)?.sent_at || new Date(0).toISOString();

  const { data: pending } = await supabaseAdmin
    .from("messages")
    .select("content, sent_at")
    .eq("lead_id", lead_id)
    .eq("direction", "inbound")
    .gt("sent_at", since)
    .order("sent_at", { ascending: true });

  const accumulated = (pending || [])
    .map((m: any) => m.content)
    .filter((c: any) => !!c)
    .join("\n");

  console.log(`[agent] mensagens acumuladas: ${(pending || []).length} | tamanho=${accumulated.length}`);

  if (!accumulated) {
    console.log(`[agent] nada para processar`);
    return;
  }

  await executeAgentForLead(agent_id, lead_id, accumulated);
}
