/**
 * Extrai apenas os dígitos de qualquer formato de identificador WhatsApp.
 * "111433027186932@lid"          → "111433027186932"
 * "5547999999999@s.whatsapp.net" → "5547999999999"
 * "5547999999999"                → "5547999999999"
 */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("@")[0].replace(/\D/g, "");
}

/**
 * Verifica se dois identificadores se referem ao mesmo contato,
 * independente do formato (@lid, @s.whatsapp.net, ou dígitos puros).
 */
export function isSamePhone(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return normalizePhone(a) === normalizePhone(b);
}
