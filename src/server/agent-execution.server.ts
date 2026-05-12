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

/**
 * Verifica se há um agente ativo para o lead. Se sim, executa o agente
 * com a mensagem recebida e retorna true (sinalizando ao caller para
 * pular os triggers de fluxo normais).
 */
export async function handleInboundForActiveAgent(
  leadId: string,
  incomingMessage: string | null,
): Promise<boolean> {
  const { data: active } = await supabaseAdmin
    .from("lead_active_agents" as any)
    .select("agent_id")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!active) return false;

  try {
    await executeAgentForLead((active as any).agent_id, leadId, incomingMessage || "");
  } catch (e) {
    console.error("[agent] inbound handling failed:", e);
  }
  return true;
}
