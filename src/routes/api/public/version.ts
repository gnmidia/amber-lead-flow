import { createFileRoute } from "@tanstack/react-router";

// Marcador de versão para verificar QUAL código está realmente no ar.
// Se este endpoint responder com o marker abaixo, o deploy pegou este código.
// Se der 404, o EasyPanel está rodando código antigo (deploy/cache não aplicou).
const BUILD_MARKER = "2026-06-07-chat-fix-3b29999";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({ ok: true, marker: BUILD_MARKER, time: new Date().toISOString() }),
          { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
        );
      },
    },
  },
});
