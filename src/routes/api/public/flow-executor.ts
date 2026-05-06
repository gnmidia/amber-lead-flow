import { createFileRoute } from "@tanstack/react-router";
import { executeFlowForLead } from "@/server/funnel-execution.server";

export const Route = createFileRoute("/api/public/flow-executor")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }),
      POST: async ({ request }) => {
        const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
        try {
          const { lead_id, flow_id, start_block_index = 0 } = await request.json() as {
            lead_id: string; flow_id: string; start_block_index?: number;
          };
          if (!lead_id || !flow_id) {
            return new Response(JSON.stringify({ error: "missing lead_id/flow_id" }), { status: 400, headers: cors });
          }

          const result = await executeFlowForLead({ lead_id, flow_id, start_block_index });

          return new Response(JSON.stringify(result), { headers: cors });
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
