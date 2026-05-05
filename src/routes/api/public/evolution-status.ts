import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy so the Evolution API key never leaks to the browser.
export const Route = createFileRoute("/api/public/evolution-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const defaultInstance = process.env.EVOLUTION_INSTANCE_NAME || "cland-main";
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "state";
        const instance = url.searchParams.get("instance") || defaultInstance;

        if (!baseUrl || !apiKey) {
          return Response.json({ error: "Evolution env not configured" }, { status: 500 });
        }

        const path = action === "connect"
          ? `/instance/connect/${instance}`
          : `/instance/connectionState/${instance}`;

        try {
          const res = await fetch(`${baseUrl}${path}`, { headers: { apikey: apiKey } });
          const json = await res.json().catch(() => ({}));
          return Response.json(json, { status: res.status });
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 502 });
        }
      },
    },
  },
});
