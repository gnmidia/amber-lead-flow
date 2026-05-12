import { createFileRoute } from "@tanstack/react-router";
import { executeAgentForLead } from "@/server/agent-execution.server";

export const Route = createFileRoute("/api/public/process-agent")({
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
          const { lead_id, agent_id, accumulated_message } = await request.json() as {
            lead_id: string; agent_id: string; accumulated_message?: string;
          };
          if (!lead_id || !agent_id) {
            return new Response(JSON.stringify({ ok: false, error: "missing lead_id/agent_id" }), { status: 400, headers: cors });
          }
          console.log(`[process-agent] lead=${lead_id} agent=${agent_id} msg="${(accumulated_message || "").substring(0, 100)}"`);
          const result = await executeAgentForLead(agent_id, lead_id, accumulated_message || "");
          return new Response(JSON.stringify({ ok: true, ...result }), { headers: cors });
        } catch (err: any) {
          console.error("[process-agent] error:", err);
          return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
