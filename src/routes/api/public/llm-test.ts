import { createFileRoute } from "@tanstack/react-router";
import { callLLM, type Provider } from "@/server/llm-providers.server";

export const Route = createFileRoute("/api/public/llm-test")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }),
      POST: async ({ request }) => {
        const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
        try {
          const body = await request.json() as {
            provider: Provider; api_key: string; model: string;
            max_tokens?: number; temperature?: number;
          };
          if (!body.provider || !body.api_key || !body.model) {
            return new Response(JSON.stringify({ ok: false, error: "missing fields" }), { status: 400, headers: cors });
          }
          const text = await callLLM(
            {
              provider: body.provider,
              api_key: body.api_key,
              model: body.model,
              max_tokens: body.max_tokens ?? 50,
              temperature: body.temperature ?? 0.2,
            },
            "Você responde em português apenas com a palavra solicitada.",
            [{ role: "user", content: "Responda apenas: OK" }],
          );
          return new Response(JSON.stringify({ ok: true, text }), { headers: cors });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
