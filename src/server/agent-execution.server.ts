import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLLM, type ChatMsg, type LLMConfig, type Provider } from "./llm-providers.server";

const COMPLETION_MARK = "[AGENTE_CONCLUIDO]";

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

export async function executeAgentForLead(
  agentId: string,
  leadId: string,
  incomingMessage: string,
): Promise<{ shouldContinue: boolean; response: string | null; reason?: string }> {
  // Load agent + connection + lead
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("agents").select("*").eq("id", agentId).maybeSingle();
  if (agentErr) throw new Error(`agent lookup: ${agentErr.message}`);
  if (!agent) throw new Error("agent not found");

  const llmId = (agent as any).llm_connection_id as string | null;
  if (!llmId) throw new Error("agente sem conexão LLM configurada");

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("llm_connections" as any).select("*").eq("id", llmId).maybeSingle();
  if (connErr) throw new Error(`llm conn lookup: ${connErr.message}`);
  if (!conn) throw new Error("conexão LLM não encontrada");

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads").select("id, name, push_name, whatsapp_number, remote_jid, instance_name")
    .eq("id", leadId).maybeSingle();
  if (leadErr) throw new Error(`lead lookup: ${leadErr.message}`);
  if (!lead) throw new Error("lead not found");

  // Last 20 messages
  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("direction, content, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false })
    .limit(20);
  const orderedHistory = (history || []).slice().reverse();

  // Max turns check (counting outbound IA messages so far)
  const maxTurns = (agent as any).max_turns ?? 20;
  const aiTurns = orderedHistory.filter((m: any) => m.direction === "outbound").length;

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
  const systemPrompt = [
    `Você é um assistente de vendas. Seu objetivo: ${(agent as any).objective || ""}`,
    `Produto: ${(agent as any).product || ""}`,
    `Tom: ${(agent as any).tone || "Misto"}`,
    `Condição de saída (quando encerrar): ${(agent as any).exit_condition || ""}`,
    "",
    "Regras:",
    "- Responda APENAS em português",
    `- Quando a condição de saída for atingida, termine sua resposta com: ${COMPLETION_MARK}`,
    "- Seja natural e conversacional",
    userPrompt ? `\nInstruções adicionais:\n${userPrompt}` : "",
  ].join("\n");

  const chatMessages: ChatMsg[] = orderedHistory.map((m: any) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
  if (incomingMessage) chatMessages.push({ role: "user", content: incomingMessage });

  // Force exit if reached max turns
  if (aiTurns >= maxTurns) {
    await applyExitTags(leadId, (agent as any).exit_tags || []);
    return { shouldContinue: true, response: null, reason: "max_turns" };
  }

  const cfg: LLMConfig = {
    provider: (conn as any).provider as Provider,
    api_key: (conn as any).api_key,
    model: (conn as any).model,
    max_tokens: (conn as any).max_tokens ?? 1000,
    temperature: Number((conn as any).temperature ?? 0.7),
  };

  let raw = await callLLM(cfg, systemPrompt, chatMessages);
  const completed = raw.includes(COMPLETION_MARK);
  const text = raw.replace(COMPLETION_MARK, "").trim();

  // Send the outgoing message via Evolution / send-message route
  if (text) {
    await sendOutgoing(lead, text);
  }

  if (completed) {
    await applyExitTags(leadId, (agent as any).exit_tags || []);
    return { shouldContinue: true, response: text, reason: "completed" };
  }

  return { shouldContinue: false, response: text };
}

async function applyExitTags(leadId: string, tagIds: string[]) {
  if (!tagIds || tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ lead_id: leadId, tag_id, assigned_by: "agent" }));
  await supabaseAdmin.from("lead_tags").upsert(rows, { onConflict: "lead_id,tag_id" } as any);
}

async function sendOutgoing(lead: any, text: string) {
  // Persist as outbound message and dispatch via Evolution if configured
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
