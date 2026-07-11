import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Settings, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";
import { ClientOnlyBuilder } from "@/components/funnel-canvas/ClientOnlyCanvas";

export const Route = createFileRoute("/funil/$id")({
  component: FunnelBuilderPage,
});

// Configurações de comportamento saíram do card da listagem e moram aqui.
// A janela de envio segue controlando o horário de disparo no dispatcher.
type FunnelConfig = {
  id: string;
  name: string;
  internal_id: string;
  consecutive: boolean;
  start_min: number;
  start_max: number;
  window_start: string;
  window_end: string;
  channels: string[];
};

const CHANNELS = ["WABA", "Baileys"];

function FunnelBuilderPage() {
  const { id } = useParams({ from: "/funil/$id" });
  const navigate = useNavigate();
  const { currentOperationId } = useOperation();
  const [funnel, setFunnel] = useState<FunnelConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const load = async () => {
    if (!currentOperationId) return;
    // Escopo por operação: funil de outra operação não abre nesta tela.
    const { data, error } = await supabase
      .from("funnels")
      .select("id, name, internal_id, consecutive, start_min, start_max, window_start, window_end, channels")
      .eq("id", id)
      .eq("operation_id", currentOperationId)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) setNotFound(true);
    else setFunnel(data as FunnelConfig);
  };
  useEffect(() => {
    load();
  }, [id, currentOperationId]);

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-muted-foreground">
          Funil não encontrado nesta operação.
        </p>
        <button
          onClick={() => navigate({ to: "/funil" })}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Funis
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header do builder */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/funil" })}
            className="rounded-md border border-border p-2 hover:border-primary/40"
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold">{funnel?.name ?? "…"}</h1>
            <p className="font-mono text-xs text-muted-foreground">{funnel?.internal_id}</p>
          </div>
        </div>
        <button
          onClick={() => setShowConfig(true)}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40"
        >
          <Settings className="h-3.5 w-3.5" /> Configurações do funil
        </button>
      </header>

      {/* Builder de canvas (blocos de ações + A/B split) */}
      <div className="min-h-0 flex-1">
        {currentOperationId && (
          <ClientOnlyBuilder funnelId={id} operationId={currentOperationId} />
        )}
      </div>

      {showConfig && funnel && (
        <ConfigDrawer
          funnel={funnel}
          onClose={() => setShowConfig(false)}
          onSaved={() => {
            setShowConfig(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Drawer de configurações (janela de envio, canais, etc.) ---------- */

function ConfigDrawer({
  funnel,
  onClose,
  onSaved,
}: {
  funnel: FunnelConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FunnelConfig>(funnel);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.internal_id.trim()) {
      toast.error("Nome e ID interno são obrigatórios");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("funnels")
      .update({
        name: form.name,
        internal_id: form.internal_id,
        consecutive: form.consecutive,
        start_min: form.start_min,
        start_max: form.start_max,
        window_start: form.window_start,
        window_end: form.window_end,
        channels: form.channels,
      })
      .eq("id", funnel.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Configurações salvas");
      onSaved();
    }
  };

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
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Configurações do Funil</h2>
            <p className="font-mono text-xs text-muted-foreground">{form.internal_id}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <Section title="Identificação">
            <Field label="Nome">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="ID Interno (único)">
              <input
                value={form.internal_id}
                onChange={(e) => setForm({ ...form, internal_id: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
          </Section>

          <Section title="Comportamento">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.consecutive}
                onChange={(e) => setForm({ ...form, consecutive: e.target.checked })}
                className="accent-primary"
              />
              Envio consecutivo
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início mín (s)">
                <input
                  type="number"
                  value={form.start_min}
                  onChange={(e) => setForm({ ...form, start_min: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Início máx (s)">
                <input
                  type="number"
                  value={form.start_max}
                  onChange={(e) => setForm({ ...form, start_max: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          </Section>

          <Section title="Janela de envio">
            <p className="text-xs text-muted-foreground">
              Controla o horário em que os disparos deste funil podem sair. Fora da janela, as
              mensagens ficam agendadas e saem quando a janela reabrir.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Janela início">
                <input
                  type="time"
                  value={form.window_start}
                  onChange={(e) => setForm({ ...form, window_start: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Janela fim">
                <input
                  type="time"
                  value={form.window_end}
                  onChange={(e) => setForm({ ...form, window_end: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          </Section>

          <Section title="Canais">
            <div className="flex gap-4">
              {CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.channels.includes(c)}
                    onChange={() => toggleChannel(c)}
                    className="accent-primary"
                  />
                  {c}
                </label>
              ))}
            </div>
          </Section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
