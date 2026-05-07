// Centraliza formatação de datas/horários em GMT-3 (America/Sao_Paulo).
// O servidor (Cloudflare Worker) roda em UTC; sem timezone explícito,
// "hoje" e horas exibidas saem erradas.

export const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD em São Paulo. */
export function ymdSP(d: Date = new Date()): string {
  // en-CA produz "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "dd/MM" a partir de "YYYY-MM-DD" (não converte timezone). */
export function dayMonthFromYmd(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/** Subtrai N dias de "hoje SP" e devolve YYYY-MM-DD. */
export function ymdSPDaysAgo(days: number): string {
  const now = new Date();
  // Calcula em UTC ms, mas o resultado em SP é estável porque ymdSP usa TZ.
  const d = new Date(now.getTime() - days * 86400000);
  return ymdSP(d);
}

/** "HH:mm" em SP. */
export function timeSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "dd/MM" em SP. */
export function dayMonthSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

/** "dd/MM/yy" em SP. */
export function dayMonthYearSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(d);
}

/** "dd/MM HH:mm" em SP. */
export function dateTimeSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "dd/MM/yyyy HH:mm:ss" em SP. */
export function fullDateTimeSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}
