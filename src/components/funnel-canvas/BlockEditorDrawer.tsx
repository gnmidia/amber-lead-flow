import { useEffect, useState } from "react";
import { X, Upload, Trash2, Type, Mic, Image as ImageIcon, Video, FileText, Tag as TagIcon, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ACTION_LABEL,
  type ActionConfig, type ActionType, type FunnelActionRow,
} from "./types";

const ACCEPT: Record<string, string> = {
  audio: "audio/ogg,audio/mp3,audio/mpeg,audio/m4a",
  imagem: "image/jpeg,image/png,image/webp",
  video: "video/mp4",
  documento: "application/pdf",
};

const ICON: Record<ActionType, React.ComponentType<{ className?: string }>> = {
  texto: Type, audio: Mic, imagem: ImageIcon, video: Video,
  documento: FileText, tag: TagIcon, delay: Clock,
};

type TagRow = { id: string; name: string; color: string };

// Editor POR BLOCO: todas as ações abertas juntas no painel da direita,
// editadas em conjunto e salvas de uma vez — sem abrir/fechar por ação.
export function BlockEditorDrawer({
  blockTitle,
  actions,
  funnelId,
  operationId,
  onClose,
  onSaved,
  onDeleteAction,
}: {
  blockTitle: string;
  actions: FunnelActionRow[];
  funnelId: string;
  operationId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleteAction: (actionId: string) => Promise<void>;
}) {
  // Cópia local dos configs — edição em lote, persistência no Salvar.
  const [configs, setConfigs] = useState<Record<string, ActionConfig>>(() =>
    Object.fromEntries(actions.map((a) => [a.id, { ...(a.config || {}) }])),
  );
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<TagRow[]>([]);

  // Sincroniza quando ações são adicionadas/removidas com o drawer aberto
  // (ex.: arrastou mais uma ação da paleta), preservando o que já foi editado.
  useEffect(() => {
    setConfigs((prev) => {
      const next: Record<string, ActionConfig> = {};
      for (const a of actions) next[a.id] = prev[a.id] ?? { ...(a.config || {}) };
      return next;
    });
  }, [actions]);

  useEffect(() => {
    if (!actions.some((a) => a.type === "tag")) return;
    supabase
      .from("tags")
      .select("id,name,color")
      .eq("operation_id", operationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setTags((data || []) as TagRow[]));
  }, [actions, operationId]);

  const patch = (id: string, p: Partial<ActionConfig>) =>
    setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const saveAll = async () => {
    // Validação de todas as ações antes de gravar qualquer uma.
    for (const a of actions) {
      const c = configs[a.id] || {};
      const label = ACTION_LABEL[a.type];
      if (a.type === "texto" && !c.content?.trim()) {
        return toast.error(`Ação ${label}: conteúdo é obrigatório`);
      }
      if (["audio", "imagem", "video", "documento"].includes(a.type) && !c.media_url) {
        return toast.error(`Ação ${label}: faça upload do arquivo`);
      }
      if (a.type === "tag" && (!c.tag_id || !c.tag_operation)) {
        return toast.error("Ação Tag: selecione a tag e a operação");
      }
      if (a.type === "delay" && (!c.value || Number(c.value) < 1)) {
        return toast.error("Ação Delay: informe a duração");
      }
    }
    setSaving(true);
    const results = await Promise.all(
      actions.map((a) =>
        (supabase.from("funnel_actions" as any) as any)
          .update({ config: configs[a.id] })
          .eq("id", a.id)
          .eq("operation_id", operationId),
      ),
    );
    setSaving(false);
    const err = results.find((r: any) => r.error)?.error;
    if (err) toast.error(err.message);
    else {
      toast.success("Bloco salvo");
      onSaved();
    }
  };

  const sorted = [...actions].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">{blockTitle || "Bloco"}</h2>
            <p className="text-xs text-muted-foreground">
              {sorted.length} açõe(s) — editadas em conjunto, na ordem de execução
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {sorted.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Bloco vazio. Arraste ações da paleta para dentro do bloco no canvas.
            </p>
          )}

          {sorted.map((a, idx) => {
            const c = configs[a.id] || {};
            const Icon = ICON[a.type];
            const isMedia = ["audio", "imagem", "video", "documento"].includes(a.type);
            return (
              <section
                key={a.id}
                className={`rounded-lg border p-4 ${
                  a.type === "delay" ? "border-warning/40 bg-warning/5" : "border-border bg-background/40"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {idx + 1}
                    </span>
                    <Icon className={`h-3.5 w-3.5 ${a.type === "delay" ? "text-warning" : "text-muted-foreground"}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">{ACTION_LABEL[a.type]}</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm(`Excluir a ação ${ACTION_LABEL[a.type]}?`)) return;
                      await onDeleteAction(a.id);
                    }}
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    title="Excluir ação"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {a.type === "texto" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {["{nome}", "{primeiro_nome}", "{produto}", "{valor}", "{link}"].map((v) => (
                        <button
                          key={v}
                          onClick={() => patch(a.id, { content: (c.content || "") + " " + v })}
                          className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-primary hover:border-primary/40"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={4}
                      value={c.content || ""}
                      onChange={(e) => patch(a.id, { content: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {isMedia && (
                  <MediaFields
                    action={a}
                    config={c}
                    funnelId={funnelId}
                    onChange={(p) => patch(a.id, p)}
                  />
                )}

                {a.type === "tag" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Operação</FieldLabel>
                      <select
                        value={c.tag_operation ?? ""}
                        onChange={(e) => patch(a.id, { tag_operation: (e.target.value || null) as any })}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Selecione…</option>
                        <option value="assign">Atribuir tag</option>
                        <option value="remove">Remover tag</option>
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Tag</FieldLabel>
                      <select
                        value={c.tag_id ?? ""}
                        onChange={(e) => patch(a.id, { tag_id: e.target.value || null })}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Selecione…</option>
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {a.type === "delay" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Duração</FieldLabel>
                      <input
                        type="number"
                        min={1}
                        value={c.value ?? 5}
                        onChange={(e) => patch(a.id, { value: Number(e.target.value) })}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <FieldLabel>Unidade</FieldLabel>
                      <select
                        value={c.unit ?? "seconds"}
                        onChange={(e) => patch(a.id, { unit: e.target.value as any })}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="seconds">Segundos</option>
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                      </select>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            Reordene arrastando as ações no próprio bloco.
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
              Fechar
            </button>
            <button
              onClick={saveAll}
              disabled={saving || sorted.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar tudo"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function MediaFields({
  action, config, funnelId, onChange,
}: {
  action: FunnelActionRow;
  config: ActionConfig;
  funnelId: string;
  onChange: (p: Partial<ActionConfig>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-2">
      {config.media_url ? (
        <div className="space-y-1.5 rounded-md border border-border bg-background p-3">
          <p className="truncate text-xs">
            <span className="font-semibold">Arquivo:</span> {config.file_name ?? "—"}
          </p>
          <a
            href={config.media_url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-primary hover:underline"
          >
            {config.media_url}
          </a>
          <button
            onClick={() => onChange({ media_url: null, file_name: null, mimetype: null })}
            className="rounded-md border border-border px-2 py-1 text-xs hover:border-destructive/40 hover:text-destructive"
          >
            Remover
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background py-4 text-sm hover:border-primary/40">
          <Upload className="h-4 w-4" />
          {uploading ? "Enviando…" : "Selecionar arquivo"}
          <input
            type="file"
            accept={ACCEPT[action.type] || ""}
            className="hidden"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const ext = file.name.split(".").pop() || "bin";
                const path = `${funnelId}/${action.id}-${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage
                  .from("funnel-media")
                  .upload(path, file, { contentType: file.type, upsert: true });
                if (upErr) throw upErr;
                const { data: pub } = supabase.storage.from("funnel-media").getPublicUrl(path);
                onChange({ media_url: pub.publicUrl, file_name: file.name, mimetype: file.type });
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
      {(action.type === "imagem" || action.type === "video") && (
        <div>
          <FieldLabel>Legenda (opcional)</FieldLabel>
          <input
            value={config.caption || ""}
            onChange={(e) => onChange({ caption: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}
