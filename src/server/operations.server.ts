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
