import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { useState } from "react";
import { Plus, ChevronDown, ChevronUp, Type, Mic, Image as ImageIcon, Video, X } from "lucide-react";

export const Route = createFileRoute("/funil")({
  component: FunilPage,
});

type StepType = "Texto" | "Áudio" | "Imagem" | "Vídeo";

type Step = {
  id: string;
  order: number;
  type: StepType;
  preview: string;
  delay: string;
};

type Funnel = {
  id: string;
  name: string;
  internal_id: string;
  consecutive: boolean;
  start_min: number;
  start_max: number;
  window: string;
  channels: string[];
  envios: number;
  respostas: number;
  steps: Step[];
};

const funnels: Funnel[] = [
  {
    id: "f1",
    name: "FUNIL UPSELL 1",
    internal_id: "funil_up1",
    consecutive: true,
    start_min: 1000,
    start_max: 1100,
    window: "00:00-22:00",
    channels: ["WABA", "Baileys"],
    envios: 177,
    respostas: 90,
    steps: [
      { id: "s1", order: 1, type: "Texto", preview: "Olá {primeiro_nome}, vi que você se interessou pelo {produto}...", delay: "Oscilante 300s-500s" },
      { id: "s2", order: 2, type: "Áudio", preview: "audio_apresentacao.ogg", delay: "Oscilante 60s-120s" },
      { id: "s3", order: 3, type: "Imagem", preview: "oferta_especial.jpg", delay: "Oscilante 200s-400s" },
      { id: "s4", order: 4, type: "Texto", preview: "Posso te enviar o link de pagamento?", delay: "Oscilante 30s-90s" },
    ],
  },
  {
    id: "f2",
    name: "FUNIL RECUPERAÇÃO",
    internal_id: "funil_rec",
    consecutive: false,
    start_min: 60,
    start_max: 120,
    window: "08:00-21:00",
    channels: ["WABA"],
    envios: 312,
    respostas: 188,
    steps: [
      { id: "s1", order: 1, type: "Texto", preview: "Vi que você não finalizou seu pedido...", delay: "Fixo 120s" },
      { id: "s2", order: 2, type: "Texto", preview: "Posso te ajudar com algo?", delay: "Oscilante 600s-1200s" },
    ],
  },
];

const typeIcon: Record<StepType, React.ComponentType<{ className?: string }>> = {
  Texto: Type,
  Áudio: Mic,
  Imagem: ImageIcon,
  Vídeo: Video,
};

function FunilPage() {
  const [expanded, setExpanded] = useState<string[]>([funnels[0].id]);
  const [editing, setEditing] = useState<{ funnel: Funnel; step: Step } | null>(null);

  const toggle = (id: string) =>
    setExpanded((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      <PageHeader
        title="Funil"
        subtitle="Funis de mensagens e automação"
        actions={
          <>
            <button
              onClick={() =>
                setExpanded(expanded.length === funnels.length ? [] : funnels.map((f) => f.id))
              }
              className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/40"
            >
              {expanded.length === funnels.length ? "Recolher tudo" : "Mostrar todos os passos"}
            </button>
            <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Novo Funil
            </button>
          </>
        }
      />

      <div className="space-y-4 p-8">
        {funnels.map((f) => {
          const isOpen = expanded.includes(f.id);
          const taxa = ((f.respostas / f.envios) * 100).toFixed(1);
          return (
            <div key={f.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-base font-semibold text-foreground">{f.name}</h3>
                    <span className="text-xs text-muted-foreground">({f.internal_id})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {f.consecutive && (
                      <Tag className="bg-muted text-muted-foreground border-border">Consecutivo</Tag>
                    )}
                    <Tag className="bg-primary/10 text-primary border-primary/30">
                      Início {f.start_min}-{f.start_max}min
                    </Tag>
                    <Tag className="bg-info/10 text-info border-info/30">Janela {f.window}</Tag>
                    <Tag className="bg-secondary text-secondary-foreground border-border">
                      {f.steps.length} passos
                    </Tag>
                    {f.channels.map((c) => (
                      <Tag key={c} className="bg-success/10 text-success border-success/30">
                        {c}
                      </Tag>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <Metric label="Envios (ord)" value={f.envios.toString()} />
                  <Metric label="Respostas" value={f.respostas.toString()} />
                  <Metric label="Taxa" value={`${taxa}%`} accent />
                  <button
                    onClick={() => toggle(f.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:border-primary/40"
                  >
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isOpen ? "Ocultar passos" : `Mostrar ${f.steps.length} passos`}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-border bg-background/40 px-5 py-3">
                  <ul className="divide-y divide-border">
                    {f.steps.map((s) => {
                      const Icon = typeIcon[s.type];
                      return (
                        <li
                          key={s.id}
                          className="flex items-center gap-4 py-3"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            {s.order}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs">
                            <Icon className="h-3 w-3 text-muted-foreground" /> {s.type}
                          </span>
                          <p className="flex-1 truncate text-sm text-foreground">{s.preview}</p>
                          <span className="text-xs text-muted-foreground">{s.delay}</span>
                          <button
                            onClick={() => setEditing({ funnel: f, step: s })}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:text-primary"
                          >
                            Editar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && <StepDrawer step={editing.step} onClose={() => setEditing(null)} />}
    </>
  );
}

function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${className}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={`text-base font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function StepDrawer({ step, onClose }: { step: Step; onClose: () => void }) {
  const [delayMode, setDelayMode] = useState<"fixo" | "oscilante">("oscilante");

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Editar Passo</h2>
            <p className="text-xs text-muted-foreground">Ordem {step.order} • {step.type}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <Section title="Tipo & Ordem">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ordem">
                <input
                  type="number"
                  defaultValue={step.order}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Tipo">
                <select
                  defaultValue={step.type}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option>Texto</option>
                  <option>Áudio</option>
                  <option>Imagem</option>
                  <option>Vídeo</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Delay antes deste passo">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="delay"
                  checked={delayMode === "fixo"}
                  onChange={() => setDelayMode("fixo")}
                  className="accent-primary"
                />
                Fixo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="delay"
                  checked={delayMode === "oscilante"}
                  onChange={() => setDelayMode("oscilante")}
                  className="accent-primary"
                />
                Oscilante
              </label>
            </div>

            {delayMode === "fixo" ? (
              <Field label="Segundos">
                <input
                  type="number"
                  defaultValue={300}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min (s)">
                    <input type="number" defaultValue={300} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Max (s)">
                    <input type="number" defaultValue={500} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  O envio acontece em valor aleatório entre min e max, simulando comportamento humano.
                  Recomendado: mínimo 20s, máximo 500s.
                </p>
              </>
            )}
          </Section>

          <Section title="Conteúdo / Legenda">
            <div className="flex flex-wrap gap-1.5">
              {["{nome}", "{primeiro_nome}", "{produto}", "{valor}", "{link}"].map((v) => (
                <button
                  key={v}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-primary hover:border-primary/40"
                >
                  {v}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              defaultValue={step.preview}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Field label="Legenda (opcional)">
              <textarea rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
          </Section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Salvar
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
