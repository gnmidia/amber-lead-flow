import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DedupInput = {
  remoteJid: string;
  alternateRemoteJids?: string[];
  senderPn?: string | null;
  pushName?: string | null;
  instance: string;
  operationId: string;
  firstContactAt?: string;
  isNewLeadDefault?: boolean;
  defaultTags?: string[];
};

type DedupResult = {
  leadId: string;
  isNew: boolean;
};

type LeadIdentityInput = {
  remoteJid: string;
  remoteJidAlt?: string | null;
  senderPn?: string | null;
  participantPn?: string | null;
  phoneNumber?: string | null;
};

type LeadRow = {
  id: string;
  whatsapp_number: string;
  remote_jid: string | null;
  tags: string[] | null;
};

const SUFFIX_RE = /@s\.whatsapp\.net$|@c\.us$|@lid$/;
const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function normalizeRemoteJid(jid?: string | null): string | null {
  if (!jid) return null;
  const value = jid.trim();
  if (!value) return null;

  if (value.endsWith("@c.us") || value.endsWith("@s.whatsapp.net")) {
    const digits = onlyDigits(value.replace(SUFFIX_RE, ""));
    return digits ? `${digits}@s.whatsapp.net` : value.replace(/@c\.us$/, "@s.whatsapp.net");
  }

  if (value.endsWith("@lid")) {
    const digits = onlyDigits(value.replace(/@lid$/, ""));
    return digits ? `${digits}@lid` : value;
  }

  if (!value.includes("@")) {
    const digits = onlyDigits(value);
    return digits ? `${digits}@s.whatsapp.net` : value;
  }

  return value;
}

export function resolveLeadIdentity(input: LeadIdentityInput) {
  const primary = normalizeRemoteJid(input.remoteJid) || input.remoteJid;
  const alternateCandidates = [
    input.remoteJidAlt,
    input.senderPn,
    input.participantPn,
    input.phoneNumber,
  ]
    .map((value) => normalizeRemoteJid(value))
    .filter(Boolean) as string[];

  const canonicalRemoteJid =
    [primary, ...alternateCandidates].find((jid) => !jid.endsWith("@lid")) || primary;

  const alternateRemoteJids = Array.from(
    new Set([primary, ...alternateCandidates].filter((jid) => jid && jid !== canonicalRemoteJid)),
  );

  const resolvedPhone = [
    input.senderPn,
    input.participantPn,
    input.phoneNumber,
    canonicalRemoteJid.endsWith("@lid") ? null : canonicalRemoteJid.replace(SUFFIX_RE, ""),
  ]
    .map((value) => (value ? onlyDigits(value) : ""))
    .find(Boolean) || null;

  return {
    remoteJid: canonicalRemoteJid,
    alternateRemoteJids,
    realPhone: resolvedPhone,
  };
}

async function getLeadByRemoteJid(operationId: string, remoteJid: string): Promise<LeadRow | null> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id, whatsapp_number, remote_jid, tags")
    .eq("operation_id", operationId)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  return (data as LeadRow | null) || null;
}

async function ensureLeadIdentity(
  lead: LeadRow,
  targetRemoteJid: string,
  realPhone: string | null,
): Promise<LeadRow> {
  const patch: Record<string, unknown> = {};
  if (lead.remote_jid !== targetRemoteJid) patch.remote_jid = targetRemoteJid;
  if (realPhone && lead.whatsapp_number !== realPhone) patch.whatsapp_number = realPhone;
  if (!Object.keys(patch).length) return lead;

  await supabaseAdmin.from("leads").update(patch).eq("id", lead.id);
  return {
    ...lead,
    remote_jid: (patch.remote_jid as string | undefined) ?? lead.remote_jid,
    whatsapp_number: (patch.whatsapp_number as string | undefined) ?? lead.whatsapp_number,
  };
}

async function mergeLeadIntoPrimary(
  primaryLead: LeadRow,
  duplicateLead: LeadRow,
  targetRemoteJid: string,
  realPhone: string | null,
): Promise<LeadRow> {
  if (primaryLead.id === duplicateLead.id) {
    return ensureLeadIdentity(primaryLead, targetRemoteJid, realPhone);
  }

  await supabaseAdmin.from("messages").update({ lead_id: primaryLead.id }).eq("lead_id", duplicateLead.id);
  await supabaseAdmin
    .from("lead_funnel_states")
    .update({ lead_id: primaryLead.id })
    .eq("lead_id", duplicateLead.id);
  await supabaseAdmin
    .from("scheduled_messages")
    .update({ lead_id: primaryLead.id })
    .eq("lead_id", duplicateLead.id);
  await supabaseAdmin.from("sales").update({ lead_id: primaryLead.id }).eq("lead_id", duplicateLead.id);

  const { data: duplicateTags } = await supabaseAdmin
    .from("lead_tags")
    .select("tag_id, assigned_by, assigned_at")
    .eq("lead_id", duplicateLead.id);

  if (duplicateTags?.length) {
    await supabaseAdmin.from("lead_tags").upsert(
      duplicateTags.map((tag) => ({
        lead_id: primaryLead.id,
        tag_id: tag.tag_id,
        assigned_by: tag.assigned_by,
        assigned_at: tag.assigned_at,
      })),
      { onConflict: "lead_id,tag_id", ignoreDuplicates: true },
    );
  }

  await supabaseAdmin.from("lead_tags").delete().eq("lead_id", duplicateLead.id);

  const mergedTags = Array.from(
    new Set([...(primaryLead.tags || []), ...(duplicateLead.tags || [])].filter(Boolean)),
  );
  const lead = await ensureLeadIdentity(primaryLead, targetRemoteJid, realPhone);
  const patch: Record<string, unknown> = {};
  if (mergedTags.length && mergedTags.length !== (lead.tags || []).length) patch.tags = mergedTags;
  if (Object.keys(patch).length) {
    await supabaseAdmin.from("leads").update(patch).eq("id", lead.id);
  }

  await supabaseAdmin.from("leads").delete().eq("id", duplicateLead.id);

  return {
    ...lead,
    tags: mergedTags.length ? mergedTags : lead.tags,
  };
}

async function mergeAlternateMatches(
  operationId: string,
  primaryLead: LeadRow,
  alternateRemoteJids: string[],
  targetRemoteJid: string,
  realPhone: string | null,
): Promise<LeadRow> {
  let currentLead = await ensureLeadIdentity(primaryLead, targetRemoteJid, realPhone);

  for (const altRemoteJid of alternateRemoteJids) {
    const duplicateLead = await getLeadByRemoteJid(operationId, altRemoteJid);
    if (!duplicateLead || duplicateLead.id === currentLead.id) continue;
    currentLead = await mergeLeadIntoPrimary(currentLead, duplicateLead, targetRemoteJid, realPhone);
  }

  return currentLead;
}

/**
 * Resolve (find or create) a lead applying the LID-aware dedup rules.
 * - When `remoteJid` ends with @s.whatsapp.net/@c.us, the JID itself carries the real phone.
 * - When `remoteJid` ends with @lid, `senderPn` (if present) holds the real phone number.
 *
 * On unique-violation (concurrent insert), retries the lookup by remote_jid.
 */
export async function findOrUpsertLead(input: DedupInput): Promise<DedupResult> {
  const { remoteJid, senderPn, pushName, instance, operationId } = input;
  const isLid = remoteJid.endsWith("@lid");
  const jidDigits = onlyDigits(remoteJid.replace(SUFFIX_RE, ""));
  const realPhone = senderPn ? onlyDigits(senderPn) : null;
  const alternateRemoteJids = Array.from(
    new Set((input.alternateRemoteJids || []).map((jid) => normalizeRemoteJid(jid)).filter(Boolean) as string[]),
  ).filter((jid) => jid !== remoteJid);

  // The "best known" phone for whatsapp_number column.
  const number = realPhone || jidDigits;

  // ───── 1. Match by remote_jid exact ─────
  {
    const lead = await getLeadByRemoteJid(operationId, remoteJid);
    if (lead) {
      await mergeAlternateMatches(operationId, lead, alternateRemoteJids, remoteJid, realPhone);
      return { leadId: lead.id, isNew: false };
    }
  }

  // ───── 1b. Match by alternate remote_jids exact ─────
  for (const altRemoteJid of alternateRemoteJids) {
    const alternateLead = await getLeadByRemoteJid(operationId, altRemoteJid);
    if (!alternateLead) continue;
    const lead = await mergeAlternateMatches(operationId, alternateLead, alternateRemoteJids, remoteJid, realPhone);
    return { leadId: lead.id, isNew: false };
  }

  // ───── 2/3. Cross-format matches when we know the real phone ─────
  if (realPhone) {
    // 2a. The contact may already exist under @s.whatsapp.net while we got @lid (or vice-versa).
    const otherJid = isLid
      ? `${realPhone}@s.whatsapp.net`
      : null; // for non-lid we already searched the canonical jid
    if (otherJid) {
      const lead = await getLeadByRemoteJid(operationId, otherJid);
      if (lead) {
        const mergedLead = await mergeAlternateMatches(operationId, lead, alternateRemoteJids, remoteJid, realPhone);
        return { leadId: mergedLead.id, isNew: false };
      }
    }

    // 2b. Match by phone number column.
    {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, whatsapp_number, remote_jid, tags")
        .eq("operation_id", operationId)
        .eq("whatsapp_number", realPhone)
        .maybeSingle();
      if (lead) {
        const mergedLead = await mergeAlternateMatches(
          operationId,
          lead as LeadRow,
          alternateRemoteJids,
          remoteJid,
          realPhone,
        );
        return { leadId: mergedLead.id, isNew: false };
      }
    }
  } else if (!isLid) {
    // No senderPn but JID is the real phone — try matching number column.
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, whatsapp_number, remote_jid, tags")
      .eq("operation_id", operationId)
      .eq("whatsapp_number", jidDigits)
      .maybeSingle();
    if (lead) {
      const mergedLead = await mergeAlternateMatches(
        operationId,
        lead as LeadRow,
        alternateRemoteJids,
        remoteJid,
        realPhone,
      );
      return { leadId: mergedLead.id, isNew: false };
    }

    // 3. Legacy LID lead whose digits are stored in whatsapp_number — adopt it.
    const { data: legacy } = await supabaseAdmin
      .from("leads")
      .select("id, whatsapp_number, remote_jid, tags")
      .eq("operation_id", operationId)
      .like("remote_jid", "%@lid")
      .eq("whatsapp_number", jidDigits)
      .maybeSingle();
    if (legacy) {
      const mergedLead = await mergeAlternateMatches(
        operationId,
        legacy as LeadRow,
        alternateRemoteJids,
        remoteJid,
        jidDigits,
      );
      return { leadId: mergedLead.id, isNew: false };
    }
  }

  // ───── 4. INSERT ─────
  const insertPayload: Record<string, unknown> = {
    whatsapp_number: number,
    remote_jid: remoteJid,
    name: pushName || number,
    push_name: pushName ?? null,
    is_new_lead: input.isNewLeadDefault ?? true,
    instance_name: instance,
    operation_id: operationId,
    tags: input.defaultTags ?? [],
  };
  if (input.firstContactAt) insertPayload.first_contact_at = input.firstContactAt;

  const { data: created, error } = await supabaseAdmin
    .from("leads")
    .insert(insertPayload as any)
    .select("id")
    .single();

  if (!error && created) {
    return { leadId: created.id, isNew: true };
  }

  // Race: another concurrent webhook inserted the same remote_jid first.
  if (error && (error.code === "23505" || /duplicate key/i.test(error.message))) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("operation_id", operationId)
      .eq("remote_jid", remoteJid)
      .maybeSingle();
    if (lead) return { leadId: lead.id, isNew: false };
  }

  throw new Error(`findOrUpsertLead failed: ${error?.message ?? "unknown"}`);
}
