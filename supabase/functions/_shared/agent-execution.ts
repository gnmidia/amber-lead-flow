// Deno port of agent-execution for the broadcast-dispatcher edge function.
const COMPLETION_MARK = "[AGENTE_CONCLUIDO]";

type ChatMsg = { role: "user" | "assistant"; content: string };

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

async function callLLM(cfg: any, system: string, messages: ChatMsg[]): Promise<string> {
  if (cfg.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cfg.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.model, max_tokens: cfg.max_tokens, temperature: cfg.temperature, system, messages }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
    const j: any = await r.json();
    return (j.content?.[0]?.text || "").trim();
  }
  if (cfg.provider === "google") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.api_key)}`;
    const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined, generationConfig: { temperature: cfg.temperature, maxOutputTokens: cfg.max_tokens } }),
    });
    if (!r.ok) throw new Error(`Google ${r.status}: ${await r.text()}`);
    const j: any = await r.json();
    return (j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "").trim();
  }
  if (cfg.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.api_key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model, max_tokens: cfg.max_tokens, temperature: cfg.temperature,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
    const j: any = await r.json();
    return (j.choices?.[0]?.message?.content || "").trim();
  }
  throw new Error(`provider não suportado: ${cfg.provider}`);
}

export async function runAgentDeno(
  supabase: any,
  agentId: string,
  leadId: string,
  incomingMessage: string,
): Promise<{ shouldContinue: boolean; response: string | null; reason?: string }> {
  const { data: agent } = await supabase.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) throw new Error("agent not found");
  const llmId = agent.llm_connection_id;
  if (!llmId) throw new Error("agente sem conexão LLM");
  const { data: conn } = await supabase.from("llm_connections").select("*").eq("id", llmId).maybeSingle();
  if (!conn) throw new Error("conexão LLM não encontrada");
  const { data: lead } = await supabase.from("leads")
    .select("id,name,push_name,whatsapp_number,remote_jid,instance_name").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("lead not found");

  const { data: history } = await supabase.from("messages")
    .select("direction,content,sent_at").eq("lead_id", leadId)
    .order("sent_at", { ascending: false }).limit(20);
  const ordered = (history || []).slice().reverse();

  const aiTurns = ordered.filter((m: any) => m.direction === "outbound").length;
  const maxTurns = agent.max_turns ?? 20;

  const leadName = lead.name || lead.push_name || "Cliente";
  const conversationHistory = ordered.map((m: any) => `${m.direction === "inbound" ? "Cliente" : "Agente"}: ${m.content || ""}`).join("\n");

  const vars: Record<string, string> = {
    lead_name: leadName,
    product: agent.product || "",
    objective: agent.objective || "",
    conversation_history: conversationHistory,
  };
  const userPrompt = renderTemplate(agent.prompt || "", vars);
  const systemPrompt = [
    `Você é um assistente de vendas. Seu objetivo: ${agent.objective || ""}`,
    `Produto: ${agent.product || ""}`,
    `Tom: ${agent.tone || "Misto"}`,
    `Condição de saída (quando encerrar): ${agent.exit_condition || ""}`,
    "",
    "Regras:",
    "- Responda APENAS em português",
    `- Quando a condição de saída for atingida, termine sua resposta com: ${COMPLETION_MARK}`,
    "- Seja natural e conversacional",
    userPrompt ? `\nInstruções adicionais:\n${userPrompt}` : "",
  ].join("\n");

  const chatMessages: ChatMsg[] = ordered.map((m: any) => ({
    role: m.direction === "inbound" ? "user" : "assistant", content: m.content || "",
  }));
  if (incomingMessage) chatMessages.push({ role: "user", content: incomingMessage });

  if (aiTurns >= maxTurns) {
    await applyExitTags(supabase, leadId, agent.exit_tags || []);
    return { shouldContinue: true, response: null, reason: "max_turns" };
  }

  const cfg = {
    provider: conn.provider, api_key: conn.api_key, model: conn.model,
    max_tokens: conn.max_tokens ?? 1000, temperature: Number(conn.temperature ?? 0.7),
  };
  const raw = await callLLM(cfg, systemPrompt, chatMessages);
  const completed = raw.includes(COMPLETION_MARK);
  const text = raw.replace(COMPLETION_MARK, "").trim();

  if (text) await sendOutgoing(supabase, lead, text);

  if (completed) {
    await applyExitTags(supabase, leadId, agent.exit_tags || []);
    return { shouldContinue: true, response: text, reason: "completed" };
  }
  return { shouldContinue: false, response: text };
}

async function applyExitTags(supabase: any, leadId: string, tagIds: string[]) {
  if (!tagIds?.length) return;
  const rows = tagIds.map((tag_id) => ({ lead_id: leadId, tag_id, assigned_by: "agent" }));
  await supabase.from("lead_tags").upsert(rows, { onConflict: "lead_id,tag_id" });
}

async function sendOutgoing(supabase: any, lead: any, text: string) {
  await supabase.from("messages").insert({
    lead_id: lead.id, direction: "outbound", type: "text", content: text, sent_by: "agent", is_ai: true,
  });
  const baseUrl = Deno.env.get("EVOLUTION_BASE_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = lead.instance_name || Deno.env.get("EVOLUTION_INSTANCE_NAME");
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
