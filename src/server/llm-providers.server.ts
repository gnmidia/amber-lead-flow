// LLM provider HTTP helper. Pure JS, runs on the Worker SSR runtime.

export type Provider = "anthropic" | "google" | "openai";
export type ChatMsg = { role: "user" | "assistant"; content: string };

export type LLMConfig = {
  provider: Provider;
  api_key: string;
  model: string;
  max_tokens: number;
  temperature: number;
};

export async function callLLM(
  cfg: LLMConfig,
  systemPrompt: string,
  messages: ChatMsg[],
): Promise<string> {
  if (cfg.provider === "anthropic") return callAnthropic(cfg, systemPrompt, messages);
  if (cfg.provider === "google") return callGoogle(cfg, systemPrompt, messages);
  if (cfg.provider === "openai") return callOpenAI(cfg, systemPrompt, messages);
  throw new Error(`Provider não suportado: ${cfg.provider}`);
}

async function callAnthropic(cfg: LLMConfig, system: string, messages: ChatMsg[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.api_key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.max_tokens,
      temperature: cfg.temperature,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  return (j.content?.[0]?.text || "").trim();
}

async function callGoogle(cfg: LLMConfig, system: string, messages: ChatMsg[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.api_key)}`;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: any = {
    contents,
    generationConfig: {
      temperature: cfg.temperature,
      maxOutputTokens: cfg.max_tokens,
      // Desliga o "thinking" dos modelos Gemini novos. Sem isso, o raciocínio
      // interno consome o orçamento de tokens e a resposta sai truncada. Para
      // mensagens de WhatsApp não precisamos desse raciocínio.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  const txt = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
  return txt.trim();
}

async function callOpenAI(cfg: LLMConfig, system: string, messages: ChatMsg[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.api_key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.max_tokens,
      temperature: cfg.temperature,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  return (j.choices?.[0]?.message?.content || "").trim();
}
