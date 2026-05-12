import { createFileRoute } from "@tanstack/react-router";
import { executeAgentForLead } from "@/server/agent-execution.server";

export const Route = createFileRoute("/api/public/agent-run")({
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
          const { agent_id, lead_id, incoming_message } = await request.json() as {
            agent_id: string; lead_id: string; incoming_message?: string;
          };
          if (!agent_id || !lead_id) {
            return new Response(JSON.stringify({ ok: false, error: "missing agent_id/lead_id" }), { status: 400, headers: cors });
          }
          const result = await executeAgentForLead(agent_id, lead_id, incoming_message || "");
          return new Response(JSON.stringify({ ok: true, ...result }), { headers: cors });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
