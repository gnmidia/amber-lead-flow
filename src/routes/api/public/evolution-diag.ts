import { createFileRoute } from "@tanstack/react-router";
import { getOperationInstance, getInstanceCredentials } from "@/server/operations.server";

export const Route = createFileRoute("/api/public/evolution-diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url0 = new URL(request.url);
        // Multi-conexão: instância/credenciais pela operação selecionada (env como fallback).
        const instance =
          url0.searchParams.get("instance") ||
          (await getOperationInstance(url0.searchParams.get("operation")));
        const { baseUrl: rawBase, apiKey } = await getInstanceCredentials(instance);
        const baseUrl = (rawBase || "").replace(/\/$/, "");
        if (!baseUrl || !apiKey || !instance) {
          return Response.json({ error: "env missing", baseUrl: !!baseUrl, apiKey: !!apiKey, instance });
        }
        const headers = { "Content-Type": "application/json", apikey: apiKey };
        const result: any = { instance, baseUrl };

        try {
          const st = await fetch(`${baseUrl}/instance/connectionState/${instance}`, { headers });
          result.connectionState = { status: st.status, body: await st.text() };
        } catch (e: any) {
          result.connectionState = { error: String(e?.message || e) };
        }

        try {
          const r = await fetch(`${baseUrl}/chat/findChats/${instance}`, {
            method: "POST", headers, body: JSON.stringify({}),
          });
          const text = await r.text();
          let j: any; try { j = JSON.parse(text); } catch { j = text; }
          const chats = Array.isArray(j) ? j : (j?.records || j?.chats || []);
          result.findChats = {
            status: r.status,
            count: Array.isArray(chats) ? chats.length : 0,
            sample: Array.isArray(chats) ? chats.slice(0, 3) : j,
            top5_recent: Array.isArray(chats)
              ? chats
                  .slice()
                  .sort((a: any, b: any) =>
                    Number(b.updatedAt || b.lastMessageTimestamp || 0) -
                    Number(a.updatedAt || a.lastMessageTimestamp || 0),
                  )
                  .slice(0, 5)
                  .map((c: any) => ({
                    jid: c.remoteJid || c.id,
                    updatedAt: c.updatedAt,
                    lastMessageTimestamp: c.lastMessageTimestamp,
                    name: c.pushName || c.name,
                  }))
              : null,
          };
        } catch (e: any) {
          result.findChats = { error: String(e?.message || e) };
        }

        return Response.json(result);
      },
    },
  },
});
