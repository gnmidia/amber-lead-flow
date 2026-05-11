import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/tags")({ component: TagsPage });

const TAG_COLORS = [
  "#22C55E", "#3B82F6", "#F97316", "#EF4444",
  "#A855F7", "#EAB308", "#06B6D4", "#EC4899",
  "#64748B", "#F59E0B", "#10B981", "#6366F1",
];

type Tag = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
};

const formatTagName = (v: string) =>
  v.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");

function TagsPage() {
  const { currentOperationId } = useOperation();
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Tag | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!currentOperationId) return;
    const { data } = await supabase.from("tags").select("*").eq("operation_id", currentOperationId).order("name");
    setTags((data || []) as Tag[]);
    const { data: lt } = await supabase.from("lead_tags").select("tag_id");
    const c: Record<string, number> = {};
    (lt || []).forEach((r: any) => (c[r.tag_id] = (c[r.tag_id] || 0) + 1));
    setCounts(c);
  };

  useEffect(() => {
    load();
  }, [currentOperationId]);

  const onDelete = async (t: Tag) => {
    if (!confirm(`Excluir a tag ${t.name}?`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Tag excluída");
      load();
    }
  };

  return (
    <>
      <PageHeader
        title="TAGS"
        subtitle="Gerenciamento de etiquetas de leads"
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Nova Tag
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {tags.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-sm font-bold">{t.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(t)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(t)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-2 min-h-[2.5rem] text-xs text-muted-foreground">
              {t.description || "—"}
            </p>
            <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {counts[t.id] || 0}
              </span>{" "}
              leads com esta tag
            </div>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground">
            Nenhuma tag cadastrada.
          </p>
        )}
      </div>

      {(creating || editing) && (
        <TagModal
          tag={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function TagModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: Tag | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tag?.name || "");
  const [color, setColor] = useState(tag?.color || TAG_COLORS[0]);
  const [description, setDescription] = useState(tag?.description || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    setSaving(true);
    const payload = { name, color, description: description || null };
    const { error } = tag
      ? await supabase.from("tags").update(payload).eq("id", tag.id)
      : await supabase.from("tags").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(tag ? "Tag atualizada" : "Tag criada");
      onSaved();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {tag ? "Editar Tag" : "Nova Tag"}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nome
            </label>
            <input
              value={name}
              onChange={(e) => setName(formatTagName(e.target.value))}
              placeholder="EX: PAGO_V1"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Cor
            </label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
