import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Archive, ArchiveRestore, Building2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/operacoes")({ component: OperacoesPage });

type Operation = {
  id: string;
  name: string;
  slug: string;
  instance_name: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
};

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

function OperacoesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Operation | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Operation | null>(null);

  const { data: operations = [], isLoading } = useQuery({
    queryKey: ["operations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Operation[];
    },
  });

  const activeCount = useMemo(() => operations.filter((o) => o.is_active).length, [operations]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["operations"] });
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    if (activeCount <= 1) {
      toast.error("Não é possível arquivar a única operação ativa.");
      setArchiveTarget(null);
      return;
    }
    const { error } = await supabase
      .from("operations" as any)
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq("id", archiveTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Operação arquivada");
      refresh();
    }
    setArchiveTarget(null);
  };

  const handleReactivate = async (op: Operation) => {
    const { error } = await supabase
      .from("operations" as any)
      .update({ is_active: true, archived_at: null })
      .eq("id", op.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Operação reativada");
      refresh();
    }
  };

  return (
    <>
      <PageHeader
        title="Operações"
        subtitle="Gerencie as operações isoladas da plataforma"
        actions={
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nova Operação
          </Button>
        }
      />

      <div className="px-8 py-6">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Instância</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Criada em</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && operations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma operação cadastrada.
                  </td>
                </tr>
              )}
              {operations.map((op) => (
                <tr key={op.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Building2 className="h-4 w-4 text-primary" />
                      {op.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{op.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">{op.instance_name || "—"}</td>
                  <td className="px-4 py-3">
                    {op.is_active ? (
                      <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
                        Ativa
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-muted-foreground/30 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Arquivada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(op.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(op)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {op.is_active ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setArchiveTarget(op)}
                          title="Arquivar"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(op)}
                          title="Reativar"
                        >
                          <ArchiveRestore className="mr-1 h-4 w-4" />
                          Reativar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <OperationFormDialog
          operation={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            refresh();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar operação?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Os dados não serão apagados, mas a operação não aparecerá mais no seletor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OperationFormDialog({
  operation,
  onClose,
  onSaved,
}: {
  operation: Operation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!operation;
  const [name, setName] = useState(operation?.name ?? "");
  const [slug, setSlug] = useState(operation?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [instanceName, setInstanceName] = useState(operation?.instance_name ?? "");
  const [saving, setSaving] = useState(false);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) return toast.error("Nome é obrigatório");
    if (!trimmedSlug) return toast.error("Slug é obrigatório");

    setSaving(true);
    const payload = {
      name: trimmedName,
      slug: trimmedSlug,
      instance_name: instanceName.trim() || null,
    };

    let error;
    if (isEdit && operation) {
      ({ error } = await supabase.from("operations" as any).update(payload).eq("id", operation.id));
    } else {
      ({ error } = await supabase
        .from("operations" as any)
        .insert({ ...payload, is_active: true }));
    }
    setSaving(false);

    if (error) {
      if (error.code === "23505") toast.error("Já existe uma operação com este slug");
      else toast.error(error.message);
      return;
    }
    toast.success(isEdit ? "Operação atualizada" : "Operação criada");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Operação" : "Nova Operação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="op-name">Nome</Label>
            <Input
              id="op-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Ex: Operação Brasil"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="op-slug">Slug</Label>
            <Input
              id="op-slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              placeholder="operacao-brasil"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="op-instance">Instância Evolution</Label>
            <Input
              id="op-instance"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="nome-da-instancia"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
