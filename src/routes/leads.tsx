import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Search, Filter } from "lucide-react";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
});

const leads = [
  { id: 1, name: "Marina Silva", phone: "+55 11 98765-4321", tags: ["Cliente"], stage: "Confirmado", product: "Mentoria Premium", last: "há 2min", status: "confirmed" },
  { id: 2, name: "Ricardo Alves", phone: "+55 21 99887-6655", tags: ["LEAD_NOVO"], stage: "Em Funil", product: "Curso Express", last: "há 14min", status: "in_funnel" },
  { id: 3, name: "Juliana Costa", phone: "+55 31 98123-4567", tags: ["ENVIO_LIST"], stage: "Comprovante Enviado", product: "Mentoria Premium", last: "há 1h", status: "receipt" },
  { id: 4, name: "Pedro Henrique", phone: "+55 41 97766-5544", tags: ["Recorrente"], stage: "Upsell", product: "Upsell VIP", last: "ontem", status: "upsell" },
  { id: 5, name: "Ana Beatriz", phone: "+55 51 96655-4433", tags: ["LEAD_NOVO", "Teste"], stage: "Lead Novo", product: "—", last: "há 3h", status: "new" },
];

const statusColor: Record<string, string> = {
  new: "border-primary/30 bg-primary/10 text-primary",
  in_funnel: "border-info/30 bg-info/10 text-info",
  receipt: "border-warning/30 bg-warning/10 text-warning",
  confirmed: "border-success/30 bg-success/10 text-success",
  upsell: "border-purple-400/30 bg-purple-400/10 text-purple-300",
};

function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="CRM de leads do WhatsApp"
        actions={
          <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/40">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </button>
        }
      />

      <div className="space-y-4 p-8">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Buscar lead por nome ou telefone..."
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Lead</th>
                <th className="px-4 py-3 text-left">Tags</th>
                <th className="px-4 py-3 text-left">Etapa</th>
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-left">Última interação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((l) => (
                <tr key={l.id} className="cursor-pointer hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {l.tags.map((t) => (
                        <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor[l.status]}`}>
                      {l.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{l.product}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
