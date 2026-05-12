import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Plus, Cpu, Pencil, Trash2, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/conexoes-ia")({ component: Page });

type Provider = "anthropic" | "google" | "openai";
type Conn = {
  id: string;
  name: string;
  provider: Provider;
  api_key: string;
  model: string;
  max_tokens: number;
  temperature: number;
  is_active: boolean;
};

const MODELS: Record<Provider, string[]> = {
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-opus-4-20250514"],
  google: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
};

const PROVIDER_BADGE: Record<Provider, string> = {
  anthropic: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  google: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  openai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  google: "Google Gemini",
  openai: "OpenAI",
};

function Page() {
  const { currentOperationId } = useOperation();
  const [items, setItems] = useState<Conn[]>([]);
  const [editing, setEditing] = useState<Conn | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!currentOperationId) return;
    const { data } = await supabase
      .from("llm_connections" as any)
      .select("*")
      .eq("operation_id", currentOperationId)
      .order("created_at", { ascending: false });
    setItems(((data || []) as unknown) as Conn[]);
  };
  useEffect(() => { load(); }, [currentOperationId]);

  const onDelete = async (c: Conn) => {
    if (!confirm(`Excluir a conexão ${c.name}?`)) return;
    const { error } = await supabase.from("llm_connections" as any).delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Conexão excluída"); load(); }
  };

  return (
    <>
      <PageHeader
        title="Conexões IA"
        subtitle="Provedores de modelos de linguagem para os agentes"
        actions={
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Nova Conexão
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>
        )}
        {items.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Cpu className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{c.name}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${c.is_active ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}`}>
                    {c.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PROVIDER_BADGE[c.provider]}`}>
                    {PROVIDER_LABEL[c.provider]}
                  </span>
                  <span className="font-mono">{c.model}</span>
                </div>
              </div>
            </div>
            <dl className="mt-4 space-y-1.5 text-xs">
              <div className="flex justify-between"><dt className="text-muted-foreground">Temperatura</dt><dd className="font-medium">{c.temperature}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Max tokens</dt><dd className="font-medium">{c.max_tokens}</dd></div>
            </dl>
            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
              <button onClick={() => onDelete(c)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-destructive/40 hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
              <button onClick={() => setEditing(c)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/40 hover:text-primary">
                <Pencil className="h-3 w-3" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ConnModal
          conn={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function ConnModal({ conn, onClose, onSaved }: { conn: Conn | null; onClose: () => void; onSaved: () => void }) {
  const { currentOperationId } = useOperation();
  const [name, setName] = useState(conn?.name || "");
  const [provider, setProvider] = useState<Provider>(conn?.provider || "anthropic");
  const [apiKey, setApiKey] = useState(conn?.api_key || "");
  const [model, setModel] = useState(conn?.model || MODELS["anthropic"][0]);
  const [maxTokens, setMaxTokens] = useState(conn?.max_tokens || 1000);
  const [temperature, setTemperature] = useState(conn?.temperature ?? 0.7);
  const [isActive, setIsActive] = useState(conn?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  useEffect(() => {
    if (!MODELS[provider].includes(model)) setModel(MODELS[provider][0]);
  }, [provider]);

  const save = async () => {
    if (!name.trim() || !apiKey.trim()) { toast.error("Nome e API key obrigatórios"); return; }
    if (!conn && !currentOperationId) { toast.error("Operação não selecionada"); return; }
    setSaving(true);
    const payload = { name, provider, api_key: apiKey, model, max_tokens: maxTokens, temperature, is_active: isActive };
    const { error } = conn
      ? await supabase.from("llm_connections" as any).update(payload).eq("id", conn.id)
      : await supabase.from("llm_connections" as any).insert({ ...payload, operation_id: currentOperationId! } as any);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(conn ? "Conexão atualizada" : "Conexão criada"); onSaved(); }
  };

  const test = async () => {
    if (!apiKey.trim()) { toast.error("Informe a API key"); return; }
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/public/llm-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey, model, max_tokens: 50, temperature }),
      });
      const json = await res.json();
      if (res.ok && json.ok) setTestResult({ ok: true, msg: json.text || "OK" });
      else setTestResult({ ok: false, msg: json.error || `HTTP ${res.status}` });
    } catch (e: any) {
      setTestResult({ ok: false, msg: String(e?.message || e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{conn ? "Editar Conexão" : "Nova Conexão"}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Nome">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Claude Sonnet Principal" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="anthropic">Anthropic</option>
              <option value="google">Google Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
          </Field>
          <Field label="API Key">
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono" />
          </Field>
          <Field label="Modelo">
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              {MODELS[provider].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Temperatura (${temperature})`}>
              <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full" />
            </Field>
            <Field label="Max tokens">
              <input type="number" min={1} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value || "0"))} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
          </div>

          <div className="rounded-md border border-border bg-background/50 p-3">
            <div className="flex items-center justify-between">
              <button onClick={test} disabled={testing} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/40 disabled:opacity-50">
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cpu className="h-3 w-3" />}
                Testar Conexão
              </button>
              {testResult && (
                <span className={`inline-flex items-center gap-1 text-xs ${testResult.ok ? "text-success" : "text-destructive"}`}>
                  {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {testResult.msg.slice(0, 80)}
                </span>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Ativo
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
