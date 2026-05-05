import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, ChevronDown, ChevronUp, Type, Mic, Image as ImageIcon, Video, FileText,
  X, Trash2, GripVertical, Pencil, Upload,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/funil")({
  component: FunilPage,
});

type StepType = "Texto" | "Áudio" | "Imagem" | "Vídeo" | "Documento";

const STEP_TYPE_TO_KIND: Record<StepType, "text" | "audio" | "image" | "video" | "document"> = {
  "Texto": "text", "Áudio": "audio", "Imagem": "image", "Vídeo": "video", "Documento": "document",
};

const ACCEPT_BY_TYPE: Record<StepType, string> = {
  "Texto": "",
  "Áudio": "audio/ogg,audio/mp3,audio/mpeg,audio/m4a",
  "Imagem": "image/jpeg,image/png,image/webp",
  "Vídeo": "video/mp4",
  "Documento": "application/pdf",
};

type Step = {
  id: string;
  funnel_id: string;
  order_index: number;
  type: StepType;
  content: string;
  caption: string | null;
  delay_type: "fixo" | "oscilante";
  delay_fixed: number | null;
  delay_min: number | null;
  delay_max: number | null;
  media_url: string | null;
  file_name: string | null;
  mimetype: string | null;
};

type Funnel = {
  id: string;
  name: string;
  internal_id: string;
  consecutive: boolean;
  start_min: number;
  start_max: number;
  window_start: string;
  window_end: string;
  channels: string[];
  envios: number;
  respostas: number;
  position: number;
};

const typeIcon: Record<StepType, React.ComponentType<{ className?: string }>> = {
  Texto: Type, Áudio: Mic, Imagem: ImageIcon, Vídeo: Video, Documento: FileText,
};

const STEP_TYPES: StepType[] = ["Texto", "Áudio", "Imagem", "Vídeo", "Documento"];
const CHANNELS = ["WABA", "Baileys"];

function delayLabel(s: Step) {
  if (s.delay_type === "fixo") return `Fixo ${s.delay_fixed ?? 0}s`;
  return `Oscilante ${s.delay_min ?? 0}s-${s.delay_max ?? 0}s`;
}

function FunilPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [editingFunnel, setEditingFunnel] = useState<Funnel | "new" | null>(null);

  const funnelsQ = useQuery({
    queryKey: ["funnels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels").select("*").order("position");
      if (error) throw error;
      return data as Funnel[];
    },
  });

  const stepsQ = useQuery({
    queryKey: ["funnel_steps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_steps").select("*").order("order_index");
      if (error) throw error;
      return (data as any[]).map((s) => ({ ...s })) as Step[];
    },
  });

  const stepsByFunnel = useMemo(() => {
    const map: Record<string, Step[]> = {};
    (stepsQ.data ?? []).forEach((s) => {
      (map[s.funnel_id] ??= []).push(s);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.order_index - b.order_index));
    return map;
  }, [stepsQ.data]);

  const deleteFunnel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funnels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Funil excluído");
      qc.invalidateQueries({ queryKey: ["funnels"] });
      qc.invalidateQueries({ queryKey: ["funnel_steps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funnel_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passo excluído");
      qc.invalidateQueries({ queryKey: ["funnel_steps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStep = useMutation({
    mutationFn: async (funnel_id: string) => {
      const existing = stepsByFunnel[funnel_id] ?? [];
      const order_index = existing.length + 1;
      const { error } = await supabase.from("funnel_steps").insert({
        funnel_id, order_index, type: "Texto", content: "Novo passo",
        delay_type: "oscilante", delay_min: 60, delay_max: 120,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel_steps"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderSteps = useMutation({
    mutationFn: async (steps: Step[]) => {
      // Two-phase to avoid unique conflicts if you add a uniq later
      const updates = steps.map((s, i) =>
        supabase.from("funnel_steps").update({ order_index: i + 1 }).eq("id", s.id)
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onMutate: async (newSteps) => {
      await qc.cancelQueries({ queryKey: ["funnel_steps"] });
      const prev = qc.getQueryData<Step[]>(["funnel_steps"]);
      if (prev) {
        const map = new Map(newSteps.map((s, i) => [s.id, i + 1]));
        qc.setQueryData<Step[]>(["funnel_steps"], prev.map((s) =>
          map.has(s.id) ? { ...s, order_index: map.get(s.id)! } : s
        ));
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["funnel_steps"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["funnel_steps"] }),
  });

  const toggle = (id: string) =>
    setExpanded((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const funnels = funnelsQ.data ?? [];

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
              {expanded.length === funnels.length && funnels.length > 0
                ? "Recolher tudo"
                : "Mostrar todos os passos"}
            </button>
            <button
              onClick={() => setEditingFunnel("new")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Novo Funil
            </button>
          </>
        }
      />

      <div className="space-y-4 p-8">
        {funnelsQ.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {funnelsQ.data && funnels.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum funil ainda.</p>
            <button
              onClick={() => setEditingFunnel("new")}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeiro funil
            </button>
          </div>
        )}

        {funnels.map((f) => {
          const isOpen = expanded.includes(f.id);
          const steps = stepsByFunnel[f.id] ?? [];
          const taxa = f.envios > 0 ? ((f.respostas / f.envios) * 100).toFixed(1) : "0.0";
          return (
            <div key={f.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-base font-semibold text-foreground">{f.name}</h3>
                    <span className="text-xs text-muted-foreground">({f.internal_id})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {f.consecutive && <Tag className="bg-muted text-muted-foreground border-border">Consecutivo</Tag>}
                    <Tag className="bg-primary/10 text-primary border-primary/30">
                      Início {f.start_min}-{f.start_max}s
                    </Tag>
                    <Tag className="bg-info/10 text-info border-info/30">
                      Janela {f.window_start}-{f.window_end}
                    </Tag>
                    <Tag className="bg-secondary text-secondary-foreground border-border">{steps.length} passos</Tag>
                    {f.channels.map((c) => (
                      <Tag key={c} className="bg-success/10 text-success border-success/30">{c}</Tag>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <Metric label="Envios" value={f.envios.toString()} />
                  <Metric label="Respostas" value={f.respostas.toString()} />
                  <Metric label="Taxa" value={`${taxa}%`} accent />
                  <button
                    onClick={() => setEditingFunnel(f)}
                    className="rounded-md border border-border p-2 hover:border-primary/40 hover:text-primary"
                    title="Editar funil"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir funil "${f.name}"?`)) deleteFunnel.mutate(f.id);
                    }}
                    className="rounded-md border border-border p-2 text-destructive hover:border-destructive/40"
                    title="Excluir funil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggle(f.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:border-primary/40"
                  >
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isOpen ? "Ocultar" : `Mostrar ${steps.length}`}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-border bg-background/40 px-5 py-3">
                  <StepsList
                    steps={steps}
                    onReorder={(arr) => reorderSteps.mutate(arr)}
                    onEdit={setEditingStep}
                    onDelete={(id) => {
                      if (confirm("Excluir este passo?")) deleteStep.mutate(id);
                    }}
                  />
                  <button
                    onClick={() => addStep.mutate(f.id)}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar passo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editingStep && (
        <StepDrawer step={editingStep} onClose={() => setEditingStep(null)} />
      )}
      {editingFunnel && (
        <FunnelDrawer
          funnel={editingFunnel === "new" ? null : editingFunnel}
          onClose={() => setEditingFunnel(null)}
        />
      )}
    </>
  );
}

function StepsList({
  steps, onReorder, onEdit, onDelete,
}: {
  steps: Step[];
  onReorder: (s: Step[]) => void;
  onEdit: (s: Step) => void;
  onDelete: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    onReorder(arrayMove(steps, oldIdx, newIdx));
  };

  if (steps.length === 0) {
    return <p className="py-3 text-xs text-muted-foreground">Nenhum passo. Adicione abaixo.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-border">
          {steps.map((s) => (
            <SortableStep key={s.id} step={s} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableStep({
  step, onEdit, onDelete,
}: {
  step: Step;
  onEdit: (s: Step) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const Icon = typeIcon[step.type];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-4 py-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {step.order_index}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs">
        <Icon className="h-3 w-3 text-muted-foreground" /> {step.type}
      </span>
      <p className="flex-1 truncate text-sm text-foreground">{step.content}</p>
      <span className="text-xs text-muted-foreground">{delayLabel(step)}</span>
      <button
        onClick={() => onEdit(step)}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:text-primary"
      >
        Editar
      </button>
      <button
        onClick={() => onDelete(step.id)}
        className="rounded-md border border-border p-1.5 text-destructive hover:border-destructive/40"
        aria-label="Excluir passo"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`text-base font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

/* ---------- Step Drawer ---------- */

function StepDrawer({ step, onClose }: { step: Step; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Step>(step);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setForm(step), [step]);

  const needsMedia = form.type !== "Texto";
  const requiresContent = form.type === "Texto";

  const save = useMutation({
    mutationFn: async () => {
      if (requiresContent && !form.content.trim()) {
        throw new Error("Conteúdo é obrigatório para passos de texto");
      }
      if (needsMedia && !form.media_url) {
        throw new Error(`Faça upload de um arquivo para o passo de ${form.type}`);
      }
      const { error } = await supabase.from("funnel_steps").update({
        order_index: form.order_index,
        type: form.type,
        content: form.content,
        caption: form.caption,
        delay_type: form.delay_type,
        delay_fixed: form.delay_type === "fixo" ? form.delay_fixed ?? 60 : null,
        delay_min: form.delay_type === "oscilante" ? form.delay_min ?? 60 : null,
        delay_max: form.delay_type === "oscilante" ? form.delay_max ?? 120 : null,
        media_url: form.media_url,
        file_name: form.file_name,
        mimetype: form.mimetype,
      }).eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passo salvo");
      qc.invalidateQueries({ queryKey: ["funnel_steps"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Editar Passo</h2>
            <p className="text-xs text-muted-foreground">Ordem {form.order_index} • {form.type}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <Section title="Tipo & Ordem">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ordem">
                <input type="number" value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Tipo">
                <select value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as StepType })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  {STEP_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Delay antes deste passo">
            <div className="flex gap-4">
              {(["fixo", "oscilante"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="delay" checked={form.delay_type === m}
                    onChange={() => setForm({ ...form, delay_type: m })} className="accent-primary" />
                  {m === "fixo" ? "Fixo" : "Oscilante"}
                </label>
              ))}
            </div>
            {form.delay_type === "fixo" ? (
              <Field label="Segundos">
                <input type="number" value={form.delay_fixed ?? 60}
                  onChange={(e) => setForm({ ...form, delay_fixed: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min (s)">
                    <input type="number" value={form.delay_min ?? 60}
                      onChange={(e) => setForm({ ...form, delay_min: Number(e.target.value) })}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Max (s)">
                    <input type="number" value={form.delay_max ?? 120}
                      onChange={(e) => setForm({ ...form, delay_max: Number(e.target.value) })}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Envio em valor aleatório entre min e max. Recomendado: mín 20s, máx 500s.
                </p>
              </>
            )}
          </Section>

          {needsMedia && (
            <Section title={`Mídia (${form.type})`}>
              {form.media_url ? (
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  <p className="truncate text-xs"><span className="font-semibold">Arquivo:</span> {form.file_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{form.mimetype ?? ""}</p>
                  <a href={form.media_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">{form.media_url}</a>
                  <button
                    onClick={() => setForm({ ...form, media_url: null, file_name: null, mimetype: null })}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:border-destructive/40 hover:text-destructive">
                    Remover
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background py-6 text-sm hover:border-primary/40">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Enviando…" : "Selecionar arquivo"}
                  <input
                    type="file"
                    accept={ACCEPT_BY_TYPE[form.type]}
                    className="hidden"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        const ext = file.name.split(".").pop() || "bin";
                        const path = `${form.funnel_id}/${form.id}-${Date.now()}.${ext}`;
                        const { error: upErr } = await supabase.storage
                          .from("funnel-media").upload(path, file, { contentType: file.type, upsert: true });
                        if (upErr) throw upErr;
                        const { data: pub } = supabase.storage.from("funnel-media").getPublicUrl(path);
                        setForm({ ...form, media_url: pub.publicUrl, file_name: file.name, mimetype: file.type });
                        toast.success("Arquivo enviado");
                      } catch (err) {
                        toast.error((err as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              )}
            </Section>
          )}

          <Section title="Conteúdo / Legenda">
            <div className="flex flex-wrap gap-1.5">
              {["{nome}", "{primeiro_nome}", "{produto}", "{valor}", "{link}"].map((v) => (
                <button key={v}
                  onClick={() => setForm({ ...form, content: form.content + " " + v })}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-primary hover:border-primary/40">
                  {v}
                </button>
              ))}
            </div>
            <textarea rows={6} value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <Field label="Legenda (opcional)">
              <textarea rows={2} value={form.caption ?? ""}
                onChange={(e) => setForm({ ...form, caption: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
          </Section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {save.isPending ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

/* ---------- Funnel Drawer ---------- */

function FunnelDrawer({ funnel, onClose }: { funnel: Funnel | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !funnel;
  const [form, setForm] = useState<Omit<Funnel, "id">>(() => ({
    name: funnel?.name ?? "",
    internal_id: funnel?.internal_id ?? "",
    consecutive: funnel?.consecutive ?? true,
    start_min: funnel?.start_min ?? 60,
    start_max: funnel?.start_max ?? 120,
    window_start: funnel?.window_start ?? "00:00",
    window_end: funnel?.window_end ?? "23:59",
    channels: funnel?.channels ?? ["WABA"],
    envios: funnel?.envios ?? 0,
    respostas: funnel?.respostas ?? 0,
    position: funnel?.position ?? 0,
  }));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.internal_id.trim()) {
        throw new Error("Nome e ID interno são obrigatórios");
      }
      if (isNew) {
        const { error } = await supabase.from("funnels").insert(form);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("funnels").update(form).eq("id", funnel!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? "Funil criado" : "Funil salvo");
      qc.invalidateQueries({ queryKey: ["funnels"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleChannel = (c: string) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c],
    }));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">
              {isNew ? "Novo Funil" : "Editar Funil"}
            </h2>
            <p className="text-xs text-muted-foreground">{form.internal_id || "—"}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <Section title="Identificação">
            <Field label="Nome">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="ID Interno (único)">
              <input value={form.internal_id} onChange={(e) => setForm({ ...form, internal_id: e.target.value })}
                placeholder="funil_up1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm" />
            </Field>
          </Section>

          <Section title="Comportamento">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.consecutive}
                onChange={(e) => setForm({ ...form, consecutive: e.target.checked })}
                className="accent-primary" />
              Envio consecutivo
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início mín (s)">
                <input type="number" value={form.start_min}
                  onChange={(e) => setForm({ ...form, start_min: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Início máx (s)">
                <input type="number" value={form.start_max}
                  onChange={(e) => setForm({ ...form, start_max: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Janela início">
                <input type="time" value={form.window_start}
                  onChange={(e) => setForm({ ...form, window_start: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Janela fim">
                <input type="time" value={form.window_end}
                  onChange={(e) => setForm({ ...form, window_end: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
          </Section>

          <Section title="Canais">
            <div className="flex gap-4">
              {CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.channels.includes(c)}
                    onChange={() => toggleChannel(c)} className="accent-primary" />
                  {c}
                </label>
              ))}
            </div>
          </Section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {save.isPending ? "Salvando…" : isNew ? "Criar" : "Salvar"}
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
