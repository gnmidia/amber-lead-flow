import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolves the Evolution instance_name for a given operation.
 * Falls back to EVOLUTION_INSTANCE_NAME env when the operation has no
 * instance configured (single-instance legacy mode).
 */
export async function getOperationInstance(
  operationId: string | null | undefined,
): Promise<string | null> {
  const fallback = process.env.EVOLUTION_INSTANCE_NAME || null;
  if (!operationId) {
    console.log(`[ops] no operation_id, using fallback instance=${fallback}`);
    return fallback;
  }
  const { data, error } = await supabaseAdmin
    .from("operations")
    .select("instance_name")
    .eq("id", operationId)
    .maybeSingle();
  if (error) {
    console.warn(`[ops] instance lookup failed for op=${operationId}:`, error.message);
    return fallback;
  }
  const inst = (data as any)?.instance_name || fallback;
  console.log(`[ops] resolved op=${operationId} -> instance=${inst}`);
  return inst;
}

/**
 * Resolve as credenciais (base_url + api_key) de uma instância da Evolution.
 * Multi-conexão: cada instância tem suas próprias credenciais na tabela
 * `instances`. Se a instância não estiver cadastrada lá, cai no env global
 * (modo single-instance legado). Isso permite vários números/instâncias
 * ativos ao mesmo tempo, cada um com sua key/url.
 */
export async function getInstanceCredentials(
  instanceName: string | null | undefined,
): Promise<{ baseUrl: string | null; apiKey: string | null; instance: string | null }> {
  const envBase = process.env.EVOLUTION_BASE_URL || null;
  const envKey = process.env.EVOLUTION_API_KEY || null;
  const inst = instanceName || process.env.EVOLUTION_INSTANCE_NAME || null;
  if (!inst) return { baseUrl: envBase, apiKey: envKey, instance: null };
  const { data } = await supabaseAdmin
    .from("instances")
    .select("base_url, api_key")
    .eq("instance_name", inst)
    .maybeSingle();
  return {
    baseUrl: (data as any)?.base_url || envBase,
    apiKey: (data as any)?.api_key || envKey,
    instance: inst,
  };
}

/**
 * Looks up the operation row that owns a given Evolution instance_name.
 * Used by inbound webhooks to route incoming messages to the correct
 * operation.
 */
export async function getOperationByInstance(
  instanceName: string | null | undefined,
): Promise<{ id: string; instance_name: string | null } | null> {
  if (!instanceName) return null;
  const { data, error } = await supabaseAdmin
    .from("operations")
    .select("id, instance_name")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (error) {
    console.warn(`[ops] op lookup by instance=${instanceName} failed:`, error.message);
    return null;
  }
  return (data as any) || null;
}
