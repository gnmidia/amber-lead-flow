import { createFileRoute } from "@tanstack/react-router";
import { getOperationInstance, getInstanceCredentials } from "@/server/operations.server";

// Server-side proxy so the Evolution API key never leaks to the browser.
// Multi-conexão: as credenciais (base_url + api_key) e o instance_name são
// resolvidos pela OPERAÇÃO selecionada (tabela operations -> instances),
// não mais pelo .env global. O env continua como fallback (single-instance).
export const Route = createFileRoute("/api/public/evolution-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "state";
        const operationId = url.searchParams.get("operation");
        const instanceParam = url.searchParams.get("instance");

        // 1. Resolve qual instância usar: param explícito > operação > env.
        const instance = instanceParam || (await getOperationInstance(operationId));
        // 2. Credenciais próprias dessa instância (com fallback no env).
        const { baseUrl, apiKey } = await getInstanceCredentials(instance);

        if (!baseUrl || !apiKey || !instance) {
          return Response.json(
            { error: "Evolution não configurada para esta operação/instância" },
            { status: 500 },
          );
        }

        const path = action === "connect"
          ? `/instance/connect/${instance}`
          : `/instance/connectionState/${instance}`;

        try {
          const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
            headers: { apikey: apiKey },
          });
          const json = await res.json().catch(() => ({}));
          return Response.json(json, { status: res.status });
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 502 });
        }
      },
    },
  },
});
