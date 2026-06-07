import { createFileRoute } from "@tanstack/react-router";
import { runAgentFollowups } from "@/server/agent-execution.server";

export const Route = createFileRoute("/api/public/agent-followup")({
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
      POST: async () => {
        const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
        try {
          const result = await runAgentFollowups();
          return new Response(JSON.stringify({ ok: true, ...result }), { headers: cors });
        } catch (err: any) {
          console.error("[agent-followup] error:", err);
          return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
