import { createFileRoute } from "@tanstack/react-router";
import { getOperationInstance, getInstanceCredentials } from "@/server/operations.server";

export const Route = createFileRoute("/api/public/groups/debug-evo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        // Multi-conexão: instância/credenciais pela operação selecionada (env como fallback).
        const instance =
          q.get("instance") || (await getOperationInstance(q.get("operation")));
        const { baseUrl: rawBase, apiKey } = await getInstanceCredentials(instance);
        const baseUrl = (rawBase || "").replace(/\/$/, "");

        const url = `${baseUrl}/group/fetchAllGroups/${instance}?getParticipants=true`;

        try {
          const res = await fetch(url, {
            headers: { apikey: apiKey! },
          });
          const text = await res.text();
          return new Response(
            JSON.stringify({
              url,
              status: res.status,
              ok: res.ok,
              body: text.slice(0, 2000),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ url, error: String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
