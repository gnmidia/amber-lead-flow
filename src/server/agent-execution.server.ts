import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLLM, type ChatMsg, type LLMConfig, type Provider } from "./llm-providers.server";

const COMPLETION_MARK = "[AGENTE_CONCLUIDO]";

// Cadência do follow-up (ver runAgentFollowups). Ajuste fino aqui.
const FOLLOWUP_FIRST_DELAY_MS = 15 * 60 * 1000; // 15min de silêncio p/ o 1º follow-up
const FOLLOWUP_SPACING_MS = 3 * 60 * 60 * 1000; // 3h entre follow-ups
const FOLLOWUP_MAX = 2; // no máximo 2 follow-ups
const FOLLOWUP_GIVEUP_MS = 24 * 60 * 60 * 1000; // desiste 24h após o último

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// Deixa o texto em minúsculas (humano), mas preserva links (case importa em URL).
function lowercaseHuman(text: string): string {
  const urlRe = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/gi;
  let result = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    result += text.slice(lastIndex, m.index).toLowerCase();
    result += m[0]; // mantém a URL exatamente como está (case importa em link)
    lastIndex = m.index + m[0].length;
  }
  result += text.slice(lastIndex).toLowerCase();
  return result;
}

// Quebra a resposta do LLM em balões curtos (separador "||"), em minúsculas.
function splitIntoMessages(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split("||")
    .map((s) => lowercaseHuman(s.trim()))
    .filter((s) => s.length > 0)
    .slice(0, 6); // trava de segurança
}

function normalizePhone(v: string | null | undefined): string {
  return (v || "").replace(/\D/g, "");
}

// As APIs de LLM exigem alternância estrita user/assistant. Como agora gravamos
// vários balões do agente (e mensagens manuais enviadas pelo celular), o
// histórico pode ter mensagens consecutivas do mesmo papel — o que faz a API
// rejeitar. Aqui mesclamos sequências do mesmo papel em uma única mensagem.
function mergeConsecutive(msgs: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of msgs) {
    if (!m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${m.content}`.trim();
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

// Detecta automaticamente se o lead entrou em algum grupo (evento de
// participante registrado pelo webhook) após o agente ficar ativo.
async function leadJoinedGroup(lead: any, sinceISO: string): Promise<boolean> {
  const phone = normalizePhone(lead.whatsapp_number || lead.remote_jid);
  if (phone.length < 8) return false;
  const last8 = phone.slice(-8);
  const { data } = await supabaseAdmin
    .from("group_events")
    .select("id")
    .ilike("phone_number", `%${last8}`)
    .in("action", ["add", "promote"])
    .gte("occurred_at", sinceISO)
    .limit(1);
  return (data?.length || 0) > 0;
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
    .select("id, name, objective, product, tone, exit_condition, prompt, exit_tags, is_active, llm_connection_id, max_turns, knowledge_base")
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

  // ───── Já entrou no grupo? Encerra sem precisar perguntar nada ─────
  const joinedSince = ((activeRow as any)?.started_at as string) || new Date(0).toISOString();
  if (await leadJoinedGroup(lead, joinedSince)) {
    console.log(`[agent] lead já entrou no grupo — encerrando agente sem perguntar`);
    await finishAgent(agentId, leadId, activeRow);
    return { shouldContinue: true, response: null, reason: "joined_group" };
  }

  const currentTurn = ((activeRow as any)?.turn_count ?? 0) as number;
  const maxTurns = ((agent as any).max_turns ?? 20) as number;

  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("direction, content, sent_at, sent_by")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false })
    .limit(30);
  // Mais antigas → mais novas, ignorando mensagens sem texto (mídia pura)
  // que só viram ruído no transcript.
  const orderedHistory = (history || [])
    .slice()
    .reverse()
    .filter((m: any) => (m.content || "").trim().length > 0);
  console.log(`[agent] histórico carregado | ${orderedHistory.length} mensagens | turn=${currentTurn}/${maxTurns}`);

  const leadName = lead.name || lead.push_name || "Cliente";

  const vars: Record<string, string> = {
    lead_name: leadName,
    product: (agent as any).product || "",
    objective: (agent as any).objective || "",
    // Mantido por compatibilidade, mas o histórico NÃO é mais injetado no
    // texto do prompt — ele vai como mensagens estruturadas (uma única vez).
    conversation_history: "",
  };

  const userInstructions = renderTemplate((agent as any).prompt || "", vars);
  const knowledgeBase = ((agent as any).knowledge_base || "").trim();

  // System prompt = APENAS persona + conhecimento + regras. O diálogo vai
  // separado, como mensagens (evita duplicar o contexto e confundir o modelo).
  const systemPrompt = [
    `Você é um atendente humano de vendas da equipe, conversando pelo WhatsApp com ${leadName}.`,
    ``,
    `## Sua missão nesta etapa`,
    (agent as any).objective || "(não especificado)",
    ``,
    `## Produto / contexto`,
    (agent as any).product || "(não especificado)",
    ``,
    knowledgeBase
      ? `## Base de conhecimento (use SOMENTE estas informações como verdade)\n${knowledgeBase}`
      : `## Base de conhecimento\n(Nenhuma base de conhecimento foi cadastrada. Se o cliente perguntar algo que você não sabe, seja honesto e diga que vai verificar com a equipe — NUNCA invente.)`,
    ``,
    userInstructions ? `## Instruções específicas\n${userInstructions}` : ``,
    ``,
    `## Sobre o objetivo (LEIA COM ATENÇÃO)`,
    `- O objetivo final é que a pessoa entre no grupo (o link JÁ foi enviado a ela).`,
    `- MAS você NÃO deve ficar perguntando se ela entrou, nem terminar suas mensagens cobrando isso. Existe OUTRO processo, separado, que cuida de checar e lembrar sobre o grupo.`,
    `- Seu papel aqui é só tirar dúvidas e quebrar objeções de forma leve, deixando a pessoa confortável e segura.`,
    `- Responda APENAS ao que a pessoa trouxe. Se ela não levantou objeção nem dúvida, seja breve e cordial — não empurre nada, não force CTA, não repita o objetivo.`,
    `- Jamais encerre uma mensagem com perguntas do tipo "conseguiu entrar?", "já entrou no grupo?", "qualquer dúvida me chama". Isso soa robótico e é proibido.`,
    ``,
    `## Como se comunicar (WhatsApp)`,
    `- Escreva como uma pessoa real digitando no WhatsApp: tudo em letras MINÚSCULAS, em português brasileiro, natural e humano.`,
    `- SEMPRE divida sua resposta em mensagens curtas (de 1 a 4 balões), como uma pessoa manda no zap. Separe cada balão com a sequência "||" (duas barras verticais). Ex: "ah entendi||relaxa que é tranquilo||é só clicar no link que eu te mandei".`,
    `- Cada balão deve ser curto. NUNCA mande um texto único grande. Sem listas com marcadores, sem linguagem de robô, sem formalidade exagerada.`,
    `- Tom de comunicação: ${(agent as any).tone || "Misto"}.`,
    `- Responda de fato ao que a pessoa disse. Não repita o que já foi dito nem fique enrolando.`,
    `- Nunca diga que é uma IA, a menos que perguntem diretamente.`,
    `- Use apenas as informações da base de conhecimento. Se não souber, diga que vai confirmar com a equipe — nunca invente preço, data, link ou promessa.`,
    ``,
    `## Encerramento`,
    `- Se o cliente claramente não quiser continuar / pedir pra parar, finalize sua última mensagem incluindo a marca ${COMPLETION_MARK} ao final (o cliente não vê essa marca).`,
    (agent as any).exit_condition
      ? `- Outra condição para encerrar: ${(agent as any).exit_condition}. Ao atingi-la, inclua ${COMPLETION_MARK} ao final.`
      : ``,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  // Diálogo enviado UMA única vez, com papéis corretos. O lead é "user"; tudo
  // que saiu da nossa parte é "assistant". A última mensagem do lead já está
  // no histórico (o webhook grava antes do agente rodar), então NÃO a anexamos
  // de novo — só usamos `incomingMessage` como fallback se o histórico vier vazio.
  let chatMessages: ChatMsg[] = orderedHistory.map((m: any) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
  const lastMsg = chatMessages[chatMessages.length - 1];
  if (incomingMessage && (!lastMsg || lastMsg.role !== "user")) {
    chatMessages.push({ role: "user", content: incomingMessage });
  }
  // A API exige que a conversa comece com "user". Remove eventuais "assistant"
  // iniciais (ex.: mensagens do funil que vieram antes da 1ª fala do lead).
  while (chatMessages.length > 0 && chatMessages[0].role !== "user") {
    chatMessages.shift();
  }
  // Garante alternância estrita (mescla balões/mensagens consecutivas do
  // mesmo papel) — senão a API da LLM rejeita a requisição.
  chatMessages = mergeConsecutive(chatMessages);
  // Fallback: se sobrou vazio, usa ao menos a mensagem recebida.
  if (chatMessages.length === 0 && incomingMessage) {
    chatMessages = [{ role: "user", content: incomingMessage }];
  }

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

  const parts = splitIntoMessages(text);
  if (parts.length) {
    console.log(`[agent] enviando ${parts.length} balão(ões) via Evolution...`);
    await sendOutgoingMessages(lead, parts);
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
  // Decisão sim/não precisa ser estável → temperatura 0 e poucos tokens.
  const evalCfg: LLMConfig = { ...cfg, temperature: 0, max_tokens: 5 };
  const result = await callLLM(evalCfg, evalPrompt, [
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

// Envia uma sequência de balões curtos como mensagens separadas no WhatsApp,
// com um pequeno intervalo entre elas (comportamento humano).
async function sendOutgoingMessages(lead: any, parts: string[]) {
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = lead.instance_name || process.env.EVOLUTION_INSTANCE_NAME;
  const number = lead.remote_jid || lead.whatsapp_number;

  for (let i = 0; i < parts.length; i++) {
    const text = parts[i];
    await supabaseAdmin.from("messages").insert({
      lead_id: lead.id,
      direction: "outbound",
      type: "text",
      content: text,
      sent_by: "agent",
      is_ai: true,
    });

    if (baseUrl && apiKey && instance && number) {
      try {
        await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({ number, text, delay: 1200 }),
        });
      } catch (e) {
        console.warn("[agent] evolution send failed:", e);
      }
    }
    // intervalo entre balões para parecer digitação humana
    if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 900));
  }
}

// Carrega a config de LLM de um agente (usado pelo follow-up).
async function loadAgentLLM(agentId: string): Promise<LLMConfig | null> {
  const { data: agent } = await supabaseAdmin
    .from("agents").select("llm_connection_id").eq("id", agentId).maybeSingle();
  const llmId = (agent as any)?.llm_connection_id;
  if (!llmId) return null;
  const { data: conn } = await supabaseAdmin
    .from("llm_connections" as any)
    .select("provider, api_key, model, max_tokens, temperature")
    .eq("id", llmId).maybeSingle();
  if (!conn) return null;
  return {
    provider: (conn as any).provider as Provider,
    api_key: (conn as any).api_key,
    model: (conn as any).model,
    max_tokens: (conn as any).max_tokens ?? 1000,
    temperature: Number((conn as any).temperature ?? 0.7),
  };
}

// Gera uma mensagem de follow-up natural e variada perguntando, de leve, se a
// pessoa conseguiu entrar no grupo. É o ÚNICO lugar onde essa pergunta acontece.
async function generateFollowupMessage(agentId: string, lead: any, count: number): Promise<string> {
  const fallback = count === 0
    ? "oi! tudo certo?||conseguiu entrar lá no grupo?"
    : "passando aqui rapidinho||deu certo entrar no grupo?";
  try {
    const cfg = await loadAgentLLM(agentId);
    if (!cfg) return fallback;
    const name = lead.name || lead.push_name || "";
    const sys = [
      "você é um atendente humano no whatsapp.",
      "gere uma mensagem curta, informal, em letras minúsculas, perguntando de forma leve e natural se a pessoa conseguiu entrar no grupo (o link já foi enviado a ela).",
      "varie o jeito de perguntar para não soar repetitivo nem forçado.",
      "divida em 1 a 2 balões curtos separados por '||'.",
      name ? `o nome da pessoa é ${name}; use só se ficar natural.` : "",
      "nada de emojis em excesso, nada de linguagem robótica.",
    ].filter(Boolean).join("\n");
    // Usa um orçamento de tokens generoso (igual à conversa normal). Com poucos
    // tokens, modelos com "thinking" gastam tudo pensando e vazam fragmentos
    // truncados/em inglês. Temperatura moderada para variar sem alucinar.
    const out = await callLLM(
      { ...cfg, temperature: 0.7, max_tokens: Math.max(cfg.max_tokens || 0, 600) },
      sys,
      [{ role: "user", content: "gere a mensagem de follow-up." }],
    );
    // Salvaguarda: se vier vazio ou suspeito (muito curto/sem letras), usa o fallback.
    const clean = (out || "").trim();
    if (clean.length < 3 || !/[a-zà-ú]/i.test(clean)) return fallback;
    return clean;
  } catch {
    return fallback;
  }
}

/**
 * CÉREBRO 2 — Follow-up. Roda por TEMPO (via cron), separado da conversa.
 * Para cada agente ativo:
 *  1. Se o lead já entrou no grupo → encerra (aplica tags + retoma o fluxo).
 *  2. Se está em silêncio há ≥15min e ainda não entrou → manda 1 follow-up
 *     natural perguntando do grupo (máx 2, espaçados 3h).
 *  3. Se já fez o máximo e segue sem entrar (após 24h) → encerra para
 *     trabalho manual (sem retomar o fluxo).
 */
export async function runAgentFollowups(): Promise<{ processed: number; sent: number; finished: number }> {
  const { data: actives } = await supabaseAdmin
    .from("lead_active_agents")
    .select("lead_id, agent_id, started_at, follow_up_count, last_follow_up_at, flow_id, resume_block_index");

  let sent = 0;
  let finished = 0;

  for (const row of (actives || []) as any[]) {
    try {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, name, push_name, whatsapp_number, remote_jid, instance_name")
        .eq("id", row.lead_id).maybeSingle();
      if (!lead) continue;

      // 1) Entrou no grupo? Encerra com sucesso.
      if (await leadJoinedGroup(lead, row.started_at || new Date(0).toISOString())) {
        await finishAgent(row.agent_id, row.lead_id, row);
        finished++;
        continue;
      }

      // Tempo de silêncio = desde a última mensagem (qualquer direção).
      const { data: lastMsg } = await supabaseAdmin
        .from("messages")
        .select("sent_at").eq("lead_id", row.lead_id)
        .order("sent_at", { ascending: false }).limit(1).maybeSingle();
      const lastActivity = (lastMsg as any)?.sent_at
        ? new Date((lastMsg as any).sent_at).getTime()
        : new Date(row.started_at).getTime();
      const silenceMs = Date.now() - lastActivity;
      const count = (row.follow_up_count as number) || 0;
      const lastFu = row.last_follow_up_at ? new Date(row.last_follow_up_at).getTime() : 0;

      // 3) Já fez o máximo e continua sem entrar → desiste (trabalho manual).
      if (count >= FOLLOWUP_MAX) {
        if (lastFu && Date.now() - lastFu >= FOLLOWUP_GIVEUP_MS) {
          await supabaseAdmin.from("lead_active_agents").delete().eq("lead_id", row.lead_id);
          await supabaseAdmin.from("leads").update({ current_agent_id: null }).eq("id", row.lead_id);
          console.log(`[followup] lead=${row.lead_id} encerrado sem entrar (limite atingido)`);
          finished++;
        }
        continue;
      }

      // 2) Está na hora de mandar um follow-up?
      const dueFirst = count === 0 && silenceMs >= FOLLOWUP_FIRST_DELAY_MS;
      const dueNext =
        count > 0 && lastFu > 0 &&
        Date.now() - lastFu >= FOLLOWUP_SPACING_MS &&
        silenceMs >= FOLLOWUP_FIRST_DELAY_MS;
      if (!dueFirst && !dueNext) continue;

      const parts = splitIntoMessages(await generateFollowupMessage(row.agent_id, lead, count));
      if (parts.length) {
        await sendOutgoingMessages(lead, parts);
        await supabaseAdmin
          .from("lead_active_agents")
          .update({ follow_up_count: count + 1, last_follow_up_at: new Date().toISOString() })
          .eq("lead_id", row.lead_id);
        console.log(`[followup] follow-up #${count + 1} enviado | lead=${row.lead_id}`);
        sent++;
      }
    } catch (e) {
      console.warn(`[followup] erro no lead ${row.lead_id}:`, e);
    }
  }

  return { processed: (actives || []).length, sent, finished };
}

/**
 * Verifica se há um agente ativo para o lead. Se sim, acumula a mensagem
 * em `lead_active_agents.pending_messages` e atualiza `last_message_at`.
 * O processamento real é feito por `process_pending_agents()` via pg_cron
 * após 30s de silêncio.
 */
export async function handleInboundForActiveAgent(
  leadId: string,
  incomingMessage: string | null,
  whatsappNumber?: string,
): Promise<boolean> {
  let { data: active } = await supabaseAdmin
    .from("lead_active_agents" as any)
    .select("agent_id, flow_id, resume_block_index, lead_id, pending_messages")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!active && whatsappNumber) {
    const { data: leadsByNumber } = await supabaseAdmin
      .from("leads")
      .select("id")
      .or(`whatsapp_number.eq.${whatsappNumber},remote_jid.eq.${whatsappNumber}`)
      .limit(5);

    for (const l of (leadsByNumber || []) as any[]) {
      if (l.id === leadId) continue;
      const { data: found } = await supabaseAdmin
        .from("lead_active_agents" as any)
        .select("agent_id, flow_id, resume_block_index, lead_id, pending_messages")
        .eq("lead_id", l.id)
        .maybeSingle();
      if (found) {
        active = found;
        console.log(
          `[agent] agente encontrado via fallback whatsapp_number | lead original=${leadId} | lead com agente=${l.id}`,
        );
        break;
      }
    }
  }

  if (!active) return false;
  const effectiveLeadId = ((active as any).lead_id as string) || leadId;
  const existing = ((active as any).pending_messages as string) || "";
  const incoming = incomingMessage || "";
  const accumulated = existing
    ? (incoming ? `${existing}\n${incoming}` : existing)
    : incoming;

  const { error: updErr } = await supabaseAdmin
    .from("lead_active_agents" as any)
    .update({
      last_message_at: new Date().toISOString(),
      pending_messages: accumulated,
    })
    .eq("lead_id", effectiveLeadId);
  if (updErr) console.warn("[buffer] update pending_messages failed:", updErr);

  console.log(
    `[buffer] mensagem acumulada | lead=${effectiveLeadId} | total="${accumulated.substring(0, 100)}"`,
  );
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
