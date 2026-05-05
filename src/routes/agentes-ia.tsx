import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Plus, Bot, Pencil } from "lucide-react";

export const Route = createFileRoute("/agentes-ia")({
  component: AgentesPage,
});

const agents = [
  {
    id: "a1",
    name: "Closer Premium",
    objective: "Qualificar lead e guiar para a compra do produto Mentoria Premium",
    product: "Mentoria Premium",
    tone: "Misto",
    exit: "comprovante enviado",
    active: true,
  },
  {
    id: "a2",
    name: "Recuperador",
    objective: "Reativar leads que não responderam em 24h",
    product: "Curso Express",
    tone: "Informal",
    exit: "keyword: PARAR",
    active: true,
  },
  {
    id: "a3",
    name: "Upsell VIP",
    objective: "Oferecer upgrade para o grupo VIP após compra confirmada",
    product: "Upsell VIP",
    tone: "Formal",
    exit: "timeout 30min",
    active: false,
  },
];

function AgentesPage() {
  return (
    <>
      <PageHeader
        title="Agentes IA"
        subtitle="Agentes conversacionais autônomos"
        actions={
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Novo Agente
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <div key={a.id} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{a.name}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      a.active
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {a.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.objective}</p>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-xs">
              <Row k="Produto" v={a.product} />
              <Row k="Tom" v={a.tone} />
              <Row k="Saída" v={a.exit} />
            </dl>

            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
              <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/40 hover:text-primary">
                <Pencil className="h-3 w-3" /> Editar prompt
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium text-foreground">{v}</dd>
    </div>
  );
}
