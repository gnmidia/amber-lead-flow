import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Plus, GitBranch, Bot, ArrowDown, GitMerge } from "lucide-react";

export const Route = createFileRoute("/fluxos")({
  component: FluxosPage,
});

type Block =
  | { type: "funnel"; name: string; steps: number; delay: string }
  | { type: "agent"; name: string; objective: string }
  | { type: "branch"; condition: string; yes: string; no: string };

const flow: Block[] = [
  { type: "funnel", name: "FUNIL BOAS-VINDAS", steps: 4, delay: "Início 0-5min" },
  { type: "agent", name: "Closer Premium", objective: "Qualificar e oferecer Mentoria" },
  { type: "branch", condition: "Lead enviou comprovante?", yes: "FUNIL CONFIRMAÇÃO", no: "FUNIL RECUPERAÇÃO" },
  { type: "funnel", name: "FUNIL UPSELL 1", steps: 4, delay: "Início 1000-1100min" },
  { type: "agent", name: "Upsell VIP", objective: "Oferecer upgrade após compra" },
];

function FluxosPage() {
  return (
    <>
      <PageHeader
        title="Fluxos"
        subtitle="Construtor de jornada — funis + agentes IA"
        actions={
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Novo Fluxo
          </button>
        }
      />

      <div className="p-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 rounded-lg border border-border bg-card p-4 text-center text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gatilho</span>
            <p className="mt-1 font-semibold text-primary">Lead novo entra via WhatsApp</p>
          </div>

          {flow.map((b, i) => (
            <div key={i}>
              <div className="flex justify-center">
                <ArrowDown className="my-1 h-4 w-4 text-muted-foreground" />
              </div>
              <BlockCard block={b} />
            </div>
          ))}

          <div className="mt-4 flex justify-center">
            <button className="inline-flex items-center gap-2 rounded-full border border-dashed border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">
              <Plus className="h-3.5 w-3.5" /> Adicionar bloco
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function BlockCard({ block }: { block: Block }) {
  if (block.type === "funnel") {
    return (
      <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-[0_0_24px_-12px_oklch(0.705_0.18_45/0.6)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <GitBranch className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Funil</p>
            <p className="text-sm font-semibold">{block.name}</p>
          </div>
          <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
            {block.steps} passos
          </span>
        </div>
        <p className="mt-2 pl-12 text-xs text-muted-foreground">{block.delay}</p>
      </div>
    );
  }
  if (block.type === "agent") {
    return (
      <div className="rounded-xl border border-info/30 bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/15 text-info">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agente IA</p>
            <p className="text-sm font-semibold">{block.name}</p>
          </div>
        </div>
        <p className="mt-2 pl-12 text-xs text-muted-foreground">{block.objective}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-warning/30 bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <GitMerge className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condição</p>
          <p className="text-sm font-semibold">{block.condition}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 pl-12">
        <div className="rounded-md border border-success/30 bg-success/10 p-2 text-xs">
          <span className="font-semibold text-success">SIM →</span> {block.yes}
        </div>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
          <span className="font-semibold text-destructive">NÃO →</span> {block.no}
        </div>
      </div>
    </div>
  );
}
