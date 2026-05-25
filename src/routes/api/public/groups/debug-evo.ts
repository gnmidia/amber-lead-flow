import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/groups/debug-evo")({
  server: {
    handlers: {
      GET: async () => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE_NAME;

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
