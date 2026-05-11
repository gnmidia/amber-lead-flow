import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DedupInput = {
  remoteJid: string;
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

const SUFFIX_RE = /@s\.whatsapp\.net$|@c\.us$|@lid$/;
const onlyDigits = (s: string) => s.replace(/\D/g, "");

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

  // The "best known" phone for whatsapp_number column.
  const number = realPhone || jidDigits;

  // ───── 1. Match by remote_jid exact ─────
  {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, whatsapp_number, remote_jid")
      .eq("operation_id", operationId)
      .eq("remote_jid", remoteJid)
      .maybeSingle();
    if (lead) {
      // If we now know the real phone and the row still has the LID digits, backfill.
      if (realPhone && lead.whatsapp_number !== realPhone) {
        await supabaseAdmin.from("leads").update({ whatsapp_number: realPhone }).eq("id", lead.id);
      }
      return { leadId: lead.id, isNew: false };
    }
  }

  // ───── 2/3. Cross-format matches when we know the real phone ─────
  if (realPhone) {
    // 2a. The contact may already exist under @s.whatsapp.net while we got @lid (or vice-versa).
    const otherJid = isLid
      ? `${realPhone}@s.whatsapp.net`
      : null; // for non-lid we already searched the canonical jid
    if (otherJid) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, whatsapp_number, remote_jid")
        .eq("operation_id", operationId)
        .eq("remote_jid", otherJid)
        .maybeSingle();
      if (lead) {
        // Promote remote_jid to the @lid (more stable identifier going forward).
        await supabaseAdmin
          .from("leads")
          .update({ remote_jid: remoteJid, whatsapp_number: realPhone })
          .eq("id", lead.id);
        return { leadId: lead.id, isNew: false };
      }
    }

    // 2b. Match by phone number column.
    {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, whatsapp_number, remote_jid")
        .eq("operation_id", operationId)
        .eq("whatsapp_number", realPhone)
        .maybeSingle();
      if (lead) {
        if (lead.remote_jid !== remoteJid) {
          await supabaseAdmin
            .from("leads")
            .update({ remote_jid: remoteJid })
            .eq("id", lead.id);
        }
        return { leadId: lead.id, isNew: false };
      }
    }
  } else if (!isLid) {
    // No senderPn but JID is the real phone — try matching number column.
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, whatsapp_number, remote_jid")
      .eq("operation_id", operationId)
      .eq("whatsapp_number", jidDigits)
      .maybeSingle();
    if (lead) {
      if (lead.remote_jid !== remoteJid) {
        await supabaseAdmin
          .from("leads")
          .update({ remote_jid: remoteJid })
          .eq("id", lead.id);
      }
      return { leadId: lead.id, isNew: false };
    }

    // 3. Legacy LID lead whose digits are stored in whatsapp_number — adopt it.
    const { data: legacy } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("operation_id", operationId)
      .like("remote_jid", "%@lid")
      .eq("whatsapp_number", jidDigits)
      .maybeSingle();
    if (legacy) {
      await supabaseAdmin
        .from("leads")
        .update({ remote_jid: remoteJid, whatsapp_number: jidDigits })
        .eq("id", legacy.id);
      return { leadId: legacy.id, isNew: false };
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
