import { useEffect, useState } from "react";
import { X, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ACTION_LABEL, type ActionConfig, type FunnelActionRow } from "./types";

const ACCEPT: Record<string, string> = {
  audio: "audio/ogg,audio/mp3,audio/mpeg,audio/m4a",
  imagem: "image/jpeg,image/png,image/webp",
  video: "video/mp4",
  documento: "application/pdf",
};

export function ActionDrawer({
  action,
  funnelId,
  operationId,
  onClose,
  onSaved,
}: {
  action: FunnelActionRow;
  funnelId: string;
  operationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<ActionConfig>(action.config || {});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);

  const isMedia = ["audio", "imagem", "video", "documento"].includes(action.type);

  useEffect(() => {
    if (action.type !== "tag") return;
    supabase
      .from("tags")
      .select("id,name,color")
      .eq("operation_id", operationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setTags((data || []) as any));
  }, [action.type, operationId]);

  const save = async () => {
    // Validações por tipo
    if (action.type === "texto" && !config.content?.trim()) {
      toast.error("Conteúdo é obrigatório");
      return;
    }
    if (isMedia && !config.media_url) {
      toast.error(`Faça upload de um arquivo de ${ACTION_LABEL[action.type].toLowerCase()}`);
      return;
    }
    if (action.type === "tag" && (!config.tag_id || !config.tag_operation)) {
      toast.error("Selecione a tag e a operação (atribuir/remover)");
      return;
    }
    if (action.type === "delay") {
      const v = Number(config.value ?? 0);
      if (!v || v < 1) {
        toast.error("Informe a duração do delay");
        return;
      }
      if (!config.unit) config.unit = "seconds";
    }
    setSaving(true);
    const { error } = await supabase
      .from("funnel_actions" as any)
      .update({ config })
      .eq("id", action.id)
      .eq("operation_id", operationId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Ação salva");
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">
            Ação: {ACTION_LABEL[action.type]}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {action.type === "texto" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {["{nome}", "{primeiro_nome}", "{produto}", "{valor}", "{link}"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setConfig({ ...config, content: (config.content || "") + " " + v })}
                    className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-primary hover:border-primary/40"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <textarea
                rows={7}
                value={config.content || ""}
                onChange={(e) => setConfig({ ...config, content: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {isMedia && (
            <div className="space-y-3">
              {config.media_url ? (
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  <p className="truncate text-xs">
                    <span className="font-semibold">Arquivo:</span> {config.file_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{config.mimetype ?? ""}</p>
                  <a
                    href={config.media_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-primary hover:underline"
                  >
                    {config.media_url}
                  </a>
                  <button
                    onClick={() => setConfig({ ...config, media_url: null, file_name: null, mimetype: null })}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:border-destructive/40 hover:text-destructive"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background py-6 text-sm hover:border-primary/40">
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
                        setConfig({
                          ...config,
                          media_url: pub.publicUrl,
                          file_name: file.name,
                          mimetype: file.type,
                        });
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
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Legenda (opcional)
                  </label>
                  <input
                    value={config.caption || ""}
                    onChange={(e) => setConfig({ ...config, caption: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {action.type === "tag" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Operação
                </label>
                <select
                  value={config.tag_operation ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, tag_operation: (e.target.value || null) as any })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione…</option>
                  <option value="assign">Atribuir tag ao lead</option>
                  <option value="remove">Remover tag do lead</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tag
                </label>
                <select
                  value={config.tag_id ?? ""}
                  onChange={(e) => setConfig({ ...config, tag_id: e.target.value || null })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione uma tag…</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Ação interna do CRM — nenhuma mensagem é enviada ao lead.
              </p>
            </div>
          )}

          {action.type === "delay" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Duração
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={config.value ?? 5}
                    onChange={(e) => setConfig({ ...config, value: Number(e.target.value) })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Unidade
                  </label>
                  <select
                    value={config.unit ?? "seconds"}
                    onChange={(e) => setConfig({ ...config, unit: e.target.value as any })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="seconds">Segundos</option>
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Espera real antes da próxima ação do bloco rodar. Toda espera do funil é feita por
                ações de delay — as mensagens saem sem delay de digitação embutido.
              </p>
            </div>
          )}
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
