import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/public/groups/group-events")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const groupId = url.searchParams.get("groupId");
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 365);

        if (!groupId) {
          return Response.json(
            { error: "groupId é obrigatório" },
            { status: 400, headers: CORS },
          );
        }

        try {
          const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

          const { data, error } = await supabaseAdmin
            .from("group_events")
            .select("action, occurred_at")
            .eq("group_id", groupId)
            .gte("occurred_at", since)
            .order("occurred_at", { ascending: true });

          if (error) {
            return Response.json(
              { error: "Erro ao buscar eventos", detail: error.message },
              { status: 500, headers: CORS },
            );
          }

          const byDate = new Map<string, { adds: number; removes: number }>();
          let totalAdds = 0;
          let totalRemoves = 0;

          for (const row of (data ?? []) as any[]) {
            const date = String(row.occurred_at).slice(0, 10);
            const bucket = byDate.get(date) ?? { adds: 0, removes: 0 };
            if (row.action === "add") {
              bucket.adds += 1;
              totalAdds += 1;
            } else if (row.action === "remove") {
              bucket.removes += 1;
              totalRemoves += 1;
            }
            byDate.set(date, bucket);
          }

          const dailyStats = Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, v]) => ({
              date,
              adds: v.adds,
              removes: v.removes,
              net: v.adds - v.removes,
            }));

          return Response.json(
            {
              dailyStats,
              totals: {
                totalAdds,
                totalRemoves,
                netGrowth: totalAdds - totalRemoves,
              },
              period: days,
            },
            { headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (err) {
          return Response.json(
            { error: "Erro ao buscar eventos", detail: String(err) },
            { status: 500, headers: CORS },
          );
        }
      },
    },
  },
});
