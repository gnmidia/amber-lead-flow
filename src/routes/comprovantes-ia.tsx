import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { FileText, Image as ImageIcon, Zap } from "lucide-react";

export const Route = createFileRoute("/comprovantes-ia")({
  component: ComprovantesPage,
});

const stats = [
  { label: "Pendentes", value: 8, color: "border-border bg-muted text-muted-foreground" },
  { label: "Confirmações", value: 142, color: "border-success/30 bg-success/10 text-success", active: true },
  { label: "Descartados", value: 17, color: "border-destructive/30 bg-destructive/10 text-destructive" },
  { label: "Falhos", value: 4, color: "border-warning/30 bg-warning/10 text-warning" },
  { label: "Triados", value: 171, color: "border-info/30 bg-info/10 text-info" },
];

const rows = [
  { id: 1, type: "img", lead: "Marina Silva", convId: "conv_2891", value: 297, paidAt: "05/05/2026 14:38", product: "Mentoria Premium", confidence: 96, status: "Confirmada" },
  { id: 2, type: "pdf", lead: "Ricardo Alves", convId: "conv_2890", value: 47, paidAt: "05/05/2026 14:12", product: "Curso Express", confidence: 88, status: "Confirmada" },
  { id: 3, type: "img", lead: "Juliana Costa", convId: "conv_2887", value: 197, paidAt: "05/05/2026 13:50", product: "Mentoria Premium", confidence: 72, status: "Pendente" },
  { id: 4, type: "img", lead: "Pedro Henrique", convId: "conv_2883", value: 100, paidAt: "05/05/2026 12:01", product: "—", confidence: 41, status: "Descartado" },
  { id: 5, type: "pdf", lead: "Ana Beatriz", convId: "conv_2880", value: 0, paidAt: "—", product: "—", confidence: 12, status: "Falho" },
];

const statusStyle: Record<string, string> = {
  Confirmada: "border-success/30 bg-success/10 text-success",
  Descartado: "border-destructive/30 bg-destructive/10 text-destructive",
  Falho: "border-warning/30 bg-warning/10 text-warning",
  Pendente: "border-border bg-muted text-muted-foreground",
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ComprovantesPage() {
  return (
    <>
      <PageHeader
        title="Comprovantes IA"
        subtitle="IA detecta comprovantes em qualquer WABA, extrai dados e sugere o próximo produto a confirmar."
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Zap className="h-3 w-3" /> FUGA AUTOMÁTICO
          </span>
        }
      />

      <div className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {stats.map((s) => (
            <button
              key={s.label}
              className={`rounded-lg border px-4 py-3 text-left transition-transform hover:-translate-y-0.5 ${s.color} ${
                s.active ? "ring-2 ring-success/40" : ""
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">{s.label}</p>
              <p className="mt-1 text-2xl font-bold">{s.value}</p>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Preview</th>
                <th className="px-4 py-3 text-left">Lead</th>
                <th className="px-4 py-3 text-left">Valor</th>
                <th className="px-4 py-3 text-left">Pago em</th>
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-left">Confiança IA</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                      {r.type === "img" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.lead}</p>
                    <p className="text-xs text-muted-foreground">{r.convId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.value > 0 ? fmt(r.value) : "—"}</span>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">
                        Extraído
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.paidAt}</td>
                  <td className="px-4 py-3">
                    {r.product !== "—" ? (
                      <span className="rounded-md border border-info/30 bg-info/10 px-2 py-1 text-xs font-medium text-info">
                        {r.product}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${
                            r.confidence > 80 ? "bg-success" : r.confidence > 60 ? "bg-warning" : "bg-destructive"
                          }`}
                          style={{ width: `${r.confidence}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold">{r.confidence}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
