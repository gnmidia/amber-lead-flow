import { createFileRoute } from "@tanstack/react-router";
import { scheduleFunnelForLead } from "@/server/funnel-execution.server";

export const Route = createFileRoute("/api/public/funnel-scheduler")({
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
        const cors = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        };
        try {
          const { lead_id, funnel_id, trigger_time } = await request.json() as {
            lead_id: string; funnel_id: string; trigger_time?: string;
          };
          const result = await scheduleFunnelForLead({ lead_id, funnel_id, trigger_time });

          return new Response(JSON.stringify(result), { headers: cors });
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
        }
      },
    },
  },
});
