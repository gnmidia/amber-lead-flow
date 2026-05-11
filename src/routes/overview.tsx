import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { PageHeader } from "../components/PageHeader";
import { MetricCard } from "../components/MetricCard";
import { CalendarRange, Clock } from "lucide-react";
import { LeadsReceivedSection } from "../components/LeadsReceivedSection";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { dayMonthYearSP } from "@/lib/datetime";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — Innova CRM" },
      { name: "description", content: "Métricas em tempo real de vendas, leads e Meta Ads." },
    ],
  }),
  component: OverviewPage,
});

const STATUS = [
  { label: "Novo", value: 187, color: "bg-primary/15 text-primary border-primary/30" },
  { label: "Recorrente", value: 42, color: "bg-info/15 text-info border-info/30" },
  { label: "Inválido", value: 13, color: "bg-muted text-muted-foreground border-border" },
  { label: "Bloqueado", value: 6, color: "bg-destructive/15 text-destructive border-destructive/30" },
  { label: "Teste", value: 3, color: "bg-warning/15 text-warning border-warning/30" },
];

type Preset = "today" | "custom";

function OverviewPage() {
  const bruto = 4820.5;
  const imposto = bruto * 0.05;
  const custoTotal = bruto + imposto;

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const [preset, setPreset] = useState<Preset>("custom");
  const [range, setRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [popoverOpen, setPopoverOpen] = useState(false);

  const applyToday = () => {
    setPreset("today");
    setRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
  };

  const periodStart = range?.from ? startOfDay(range.from) : subDays(new Date(), 29);
  const periodEnd = range?.to ? endOfDay(range.to) : endOfDay(new Date());

  const { currentOperationId } = useOperation();
  const dateFrom = format(periodStart, "yyyy-MM-dd");
  const dateTo = format(periodEnd, "yyyy-MM-dd");

  const { data: salesSummary } = useQuery({
    queryKey: ["sales-summary", currentOperationId, dateFrom, dateTo],
    enabled: !!currentOperationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sales_summary" as any, {
        op_id: currentOperationId!,
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (error) throw error;
      return (data ?? {}) as { total_sales?: number; total_revenue?: number; avg_ticket?: number };
    },
  });

  const totalSales = Number(salesSummary?.total_sales ?? 0);
  const totalRevenue = Number(salesSummary?.total_revenue ?? 0);
  const avgTicket = Number(salesSummary?.avg_ticket ?? 0);

  const labelCustom =
    range?.from && range?.to
      ? `${dayMonthYearSP(range.from)} – ${dayMonthYearSP(range.to)}`
      : "Personalizar";

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Métricas em tempo real"
        actions={
          <>
            <button
              onClick={applyToday}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                preset === "today"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> Hoje
            </button>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                    preset === "custom"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  <CalendarRange className="h-3.5 w-3.5" /> {labelCustom}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={(r) => {
                    setRange(r);
                    setPreset("custom");
                    if (r?.from && r?.to) setPopoverOpen(false);
                  }}
                  numberOfMonths={2}
                  locale={ptBR}
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
          </>
        }
      />

      <div className="space-y-8 p-8">
        <LeadsReceivedSection startDate={periodStart} endDate={periodEnd} />

        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Financeiro
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Investido Bruto" value={fmt(bruto)} sub={`Bruto ${fmt(bruto / 28)}`} />
            <MetricCard label="Imposto Meta 5%" value={`-${fmt(imposto)}`} sub="auto" trend="down" accent="destructive" />
            <MetricCard label="Custo Total Ads" value={`-${fmt(custoTotal)}`} sub="bruto + imposto" trend="down" accent="destructive" />
            <MetricCard label="Desconto" value={fmt(120)} sub="cupons aplicados" trend="up" accent="success" />
            <MetricCard label="Lucro Líquido" value={fmt(7820.4)} sub="+18,2% vs ontem" trend="up" accent="success" />
            <MetricCard label="Margem de Lucro" value="61.8%" sub="estável" accent="success" />
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Aquisição & Performance Meta Ads
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Custo por Lead" value={fmt(2.41)} sub="187 conversas" />
            <MetricCard label="Custo por Lead Real" value={fmt(3.12)} sub="142 leads WABA" accent="primary" />
            <MetricCard label="Custo por Lead Válido" value={fmt(4.78)} sub="89 validados" />
            <MetricCard label="ROI" value="+312.4%" sub="+24,1%" trend="up" accent="success" />
            <MetricCard label="CPM" value={fmt(18.2)} sub="-4,2%" trend="down" accent="success" />
            <MetricCard label="CTR / CPC" value="2,84%" sub={`${fmt(0.64)} CPC`} />
          </div>
        </section>

        <section>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Leads WABA — ROAS
                </h2>
                <p className="mt-1 text-3xl font-bold text-foreground">251</p>
                <p className="text-xs text-muted-foreground">leads no período</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {STATUS.map((s) => (
                <div
                  key={s.label}
                  className={`rounded-lg border px-4 py-3 ${s.color}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
                    {s.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
