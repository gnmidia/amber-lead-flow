import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// CRUD servidor de llm_connections. A api_key (texto puro) NUNCA passa pelo
// navegador na leitura — este endpoint recebe a key só na escrita (via service
// key) e devolve a linha SEM a api_key. Toda operação é escopada por
// operation_id para não permitir mexer em conexões de outra operação.

// Colunas devolvidas ao cliente — deliberadamente SEM api_key.
const SAFE_COLUMNS =
  "id, operation_id, name, provider, model, max_tokens, temperature, is_active, created_at";

export const Route = createFileRoute("/api/public/llm-connections")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({} as any));
        const {
          action,
          id,
          operation_id,
          name,
          provider,
          api_key,
          model,
          max_tokens,
          temperature,
          is_active,
        } = body || {};

        if (!operation_id) {
          return Response.json({ error: "operation_id obrigatório" }, { status: 400 });
        }

        // ───── DELETE ─────
        if (action === "delete") {
          if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });
          const { error } = await supabaseAdmin
            .from("llm_connections")
            .delete()
            .eq("id", id)
            .eq("operation_id", operation_id);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ success: true });
        }

        // ───── CREATE ─────
        if (action === "create") {
          if (!name || !provider || !model) {
            return Response.json({ error: "name/provider/model obrigatórios" }, { status: 400 });
          }
          if (!api_key || !String(api_key).trim()) {
            return Response.json({ error: "api_key obrigatória na criação" }, { status: 400 });
          }
          const { data, error } = await supabaseAdmin
            .from("llm_connections")
            .insert({
              operation_id,
              name,
              provider,
              api_key,
              model,
              max_tokens: max_tokens ?? 1000,
              temperature: temperature ?? 0.7,
              is_active: is_active ?? true,
            } as any)
            .select(SAFE_COLUMNS)
            .maybeSingle();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ success: true, data });
        }

        // ───── UPDATE ─────
        if (action === "update") {
          if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });
          // Monta o patch SEM api_key. Só sobrescreve a key se o payload trouxer
          // uma nova e não vazia — campo vazio/ausente mantém a chave atual.
          const patch: Record<string, unknown> = {};
          if (name !== undefined) patch.name = name;
          if (provider !== undefined) patch.provider = provider;
          if (model !== undefined) patch.model = model;
          if (max_tokens !== undefined) patch.max_tokens = max_tokens;
          if (temperature !== undefined) patch.temperature = temperature;
          if (is_active !== undefined) patch.is_active = is_active;
          if (typeof api_key === "string" && api_key.trim()) patch.api_key = api_key;

          const { data, error } = await supabaseAdmin
            .from("llm_connections")
            .update(patch as any)
            .eq("id", id)
            .eq("operation_id", operation_id)
            .select(SAFE_COLUMNS)
            .maybeSingle();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ success: true, data });
        }

        return Response.json({ error: `ação inválida: ${action}` }, { status: 400 });
      },
    },
  },
});
