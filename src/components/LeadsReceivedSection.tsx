import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, parseISO, startOfDay, isToday, isYesterday } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type LeadsPerDayRow = { day: string; total: number; new_leads: number };
type LeadsPerDayByTagRow = {
  day: string;
  tag_id: string;
  tag_name: string;
  tag_color: string;
  total: number;
};
type Tag = { id: string; name: string; color: string };

const fmtDay = (d: string) => format(parseISO(d), "dd/MM");
const todayStr = () => format(new Date(), "yyyy-MM-dd");
const yesterdayStr = () => format(subDays(new Date(), 1), "yyyy-MM-dd");

type Props = { startDate: Date; endDate: Date };

export function LeadsReceivedSection({ startDate, endDate }: Props) {
  const [tab, setTab] = useState<"all" | "byTag">("all");
  const [perDay, setPerDay] = useState<LeadsPerDayRow[]>([]);
  const [perDayByTag, setPerDayByTag] = useState<LeadsPerDayByTagRow[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | "ALL">("ALL");

  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const loadAll = useCallback(async () => {
    const [{ data: d1 }, { data: d2 }, { data: d3 }] = await Promise.all([
      supabase
        .from("leads_per_day" as never)
        .select("*")
        .gte("day", startStr)
        .lte("day", endStr)
        .order("day", { ascending: false }),
      supabase
        .from("leads_per_day_by_tag" as never)
        .select("*")
        .gte("day", startStr)
        .lte("day", endStr)
        .order("day", { ascending: false }),
      supabase
        .from("tags")
        .select("id, name, color")
        .eq("is_active", true)
        .order("name"),
    ]);
    setPerDay((d1 as LeadsPerDayRow[]) || []);
    setPerDayByTag((d2 as LeadsPerDayByTagRow[]) || []);
    setTags((d3 as Tag[]) || []);
  }, [startStr, endStr]);


  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("leads-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_tags" },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadAll]);

  // Summary
  const summary = useMemo(() => {
    const t = todayStr();
    const y = yesterdayStr();
    const last7 = format(subDays(new Date(), 6), "yyyy-MM-dd");
    const today = perDay.find((r) => r.day === t)?.new_leads ?? 0;
    const yesterday = perDay.find((r) => r.day === y)?.new_leads ?? 0;
    const seven = perDay
      .filter((r) => r.day >= last7)
      .reduce((s, r) => s + (r.new_leads ?? 0), 0);
    const total = perDay.reduce((s, r) => s + (r.total ?? 0), 0);
    return { today, yesterday, seven, total };
  }, [perDay]);

  // Chart all leads (last 30 days, ascending)
  const chartAll = useMemo(() => {
    return [...perDay]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({ day: fmtDay(r.day), total: r.total, raw: r.day }));
  }, [perDay]);

  // Table — last 7 days with tag breakdown
  const last7Rows = useMemo(() => {
    const cutoff = format(subDays(new Date(), 6), "yyyy-MM-dd");
    const days = perDay.filter((r) => r.day >= cutoff);
    return days.map((row) => {
      const tagsForDay = perDayByTag
        .filter((t) => t.day === row.day)
        .reduce<Record<string, number>>((acc, t) => {
          acc[t.tag_name] = t.total;
          return acc;
        }, {});
      return { ...row, tags: tagsForDay };
    });
  }, [perDay, perDayByTag]);

  // Stacked data for "ALL" tags
  const stacked = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    perDayByTag.forEach((r) => {
      const key = r.day;
      if (!map.has(key)) map.set(key, { day: fmtDay(r.day), raw: r.day });
      map.get(key)![r.tag_name] = r.total;
    });
    return Array.from(map.values()).sort((a, b) =>
      String(a.raw).localeCompare(String(b.raw)),
    );
  }, [perDayByTag]);

  const selectedTag = tags.find((t) => t.id === selectedTagId);

  const singleTagSeries = useMemo(() => {
    if (!selectedTag) return [];
    return perDayByTag
      .filter((r) => r.tag_id === selectedTag.id)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({ day: fmtDay(r.day), total: r.total, raw: r.day }));
  }, [perDayByTag, selectedTag]);

  const tagDayLabel = (day: string) => {
    const d = parseISO(day);
    if (isToday(d)) return `Hoje ${fmtDay(day)}`;
    if (isYesterday(d)) return `Ontem ${fmtDay(day)}`;
    return fmtDay(day);
  };

  // Unique active tag names actually present in data (used for stacked bars)
  const tagsForStack = useMemo(() => {
    const names = new Set(perDayByTag.map((r) => r.tag_name));
    return tags.filter((t) => names.has(t.name));
  }, [tags, perDayByTag]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Leads Recebidos
        </h2>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setTab("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos os Leads
          </button>
          <button
            onClick={() => setTab("byTag")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "byTag"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Por Tag
          </button>
        </div>
      </div>

      {tab === "all" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="Hoje" value={summary.today} sub="leads novos" />
            <SummaryCard label="Ontem" value={summary.yesterday} sub="leads novos" />
            <SummaryCard label="Últimos 7d" value={summary.seven} sub="leads novos" />
            <SummaryCard label="No Período" value={summary.total} sub="total" />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Leads por dia — últimos 30 dias
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartAll}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total" fill="#F97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Novos</th>
                  {tags.map((t) => (
                    <th key={t.id} className="px-4 py-3 text-left">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {last7Rows.map((row) => (
                  <tr key={row.day} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{tagDayLabel(row.day)}</td>
                    <td className="px-4 py-3">{row.total}</td>
                    <td className="px-4 py-3">{row.new_leads}</td>
                    {tags.map((t) => (
                      <td key={t.id} className="px-4 py-3">
                        {row.tags[t.name] ? (
                          <span
                            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: `${t.color}22`,
                              color: t.color,
                              borderColor: `${t.color}55`,
                            }}
                          >
                            {row.tags[t.name]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {last7Rows.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-muted-foreground"
                      colSpan={3 + tags.length}
                    >
                      Sem dados nos últimos 7 dias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <TagBadge
              label="TODAS"
              color="#6B7280"
              active={selectedTagId === "ALL"}
              onClick={() => setSelectedTagId("ALL")}
            />
            {tags.map((t) => (
              <TagBadge
                key={t.id}
                label={t.name}
                color={t.color}
                active={selectedTagId === t.id}
                onClick={() => setSelectedTagId(t.id)}
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {selectedTagId === "ALL"
                ? "Leads por dia — empilhado por tag"
                : `Leads por dia — ${selectedTag?.name}`}
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {selectedTagId === "ALL" ? (
                  <BarChart data={stacked}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    {tagsForStack.map((t) => (
                      <Bar
                        key={t.id}
                        dataKey={t.name}
                        stackId="a"
                        fill={t.color}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <BarChart data={singleTagSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="total"
                      fill={selectedTag?.color || "#F97316"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {selectedTagId === "ALL" ? (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-left">Total</th>
                    {tags.map((t) => (
                      <th key={t.id} className="px-4 py-3 text-left">
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {last7Rows.map((row) => (
                    <tr key={row.day} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{tagDayLabel(row.day)}</td>
                      <td className="px-4 py-3">{row.total}</td>
                      {tags.map((t) => {
                        const n = row.tags[t.name] ?? 0;
                        const pct = row.total ? ((n / row.total) * 100).toFixed(0) : "0";
                        return (
                          <td key={t.id} className="px-4 py-3">
                            {n > 0 ? (
                              <span style={{ color: t.color }}>
                                {n}{" "}
                                <span className="text-muted-foreground">({pct}%)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-left">
                      Leads com {selectedTag?.name}
                    </th>
                    <th className="px-4 py-3 text-left">% do total do dia</th>
                  </tr>
                </thead>
                <tbody>
                  {singleTagSeries
                    .slice()
                    .reverse()
                    .slice(0, 14)
                    .map((row) => {
                      const dayTotal =
                        perDay.find((d) => d.day === row.raw)?.total ?? 0;
                      const pct = dayTotal
                        ? ((row.total / dayTotal) * 100).toFixed(1)
                        : "0.0";
                      return (
                        <tr key={row.raw} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">
                            {tagDayLabel(row.raw)}
                          </td>
                          <td className="px-4 py-3" style={{ color: selectedTag?.color }}>
                            {row.total}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{pct}%</td>
                        </tr>
                      );
                    })}
                  {singleTagSeries.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted-foreground"
                        colSpan={3}
                      >
                        Sem dados para esta tag.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function TagBadge({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
      style={{
        backgroundColor: active ? color : `${color}22`,
        color: active ? "#fff" : color,
        border: `1px solid ${active ? "#fff" : `${color}55`}`,
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: active ? "#fff" : color }}
      />
      {label}
    </button>
  );
}
