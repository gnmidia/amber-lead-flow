import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/groups/group-messages")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const groupId = url.searchParams.get("groupId");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

        if (!groupId) {
          return Response.json(
            { error: "groupId é obrigatório" },
            { status: 400, headers: CORS },
          );
        }

        try {
          // O CRM armazena mensagens por lead. Tentamos achar um lead cujo
          // whatsapp_number corresponda ao JID do grupo.
          const { data: leads } = await supabaseAdmin
            .from("leads")
            .select("id")
            .or(`whatsapp_number.eq.${groupId},whatsapp_number.eq.${groupId.split("@")[0]}`)
            .limit(5);

          const leadIds = (leads ?? []).map((l: any) => l.id);

          if (leadIds.length === 0) {
            return Response.json(
              { messages: [], totalMessages: 0, todayMessages: 0, weekMessages: 0 },
              { headers: { ...CORS, "Content-Type": "application/json" } },
            );
          }

          const now = Date.now();
          const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
          const weekAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

          const [msgsRes, totalRes, todayRes, weekRes] = await Promise.all([
            supabaseAdmin
              .from("messages")
              .select("id, content, direction, sent_at, sent_by")
              .in("lead_id", leadIds)
              .order("sent_at", { ascending: false })
              .limit(limit),
            supabaseAdmin
              .from("messages")
              .select("id", { count: "exact", head: true })
              .in("lead_id", leadIds),
            supabaseAdmin
              .from("messages")
              .select("id", { count: "exact", head: true })
              .in("lead_id", leadIds)
              .gte("sent_at", dayAgo),
            supabaseAdmin
              .from("messages")
              .select("id", { count: "exact", head: true })
              .in("lead_id", leadIds)
              .gte("sent_at", weekAgo),
          ]);

          return Response.json(
            {
              messages: msgsRes.data ?? [],
              totalMessages: totalRes.count ?? 0,
              todayMessages: todayRes.count ?? 0,
              weekMessages: weekRes.count ?? 0,
            },
            { headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (err) {
          return Response.json(
            { error: "Erro ao buscar mensagens", detail: String(err) },
            { status: 500, headers: CORS },
          );
        }
      },
    },
  },
});
