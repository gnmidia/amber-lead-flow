import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Plus, Pencil, Trash2, X, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/ofertas")({ component: OfertasPage });

type Offer = {
  id: string;
  name: string;
  description: string | null;
  product_name: string | null;
  price: number;
  pix_key: string | null;
  recipient: string | null;
  is_active: boolean;
};

const fmt = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function OfertasPage() {
  const { currentOperationId } = useOperation();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!currentOperationId) return;
    const { data } = await supabase.from("offers").select("*")
      .eq("operation_id", currentOperationId)
      .order("price", { ascending: true });
    setOffers((data || []) as Offer[]);
  };
  useEffect(() => { load(); }, [currentOperationId]);

  const onDelete = async (o: Offer) => {
    if (!confirm(`Excluir a oferta ${o.name}?`)) return;
    const { error } = await supabase.from("offers").delete().eq("id", o.id);
    if (error) toast.error(error.message);
    else { toast.success("Oferta excluída"); load(); }
  };

  // Agrupar por product_name
  const grouped = offers.reduce<Record<string, Offer[]>>((acc, o) => {
    const k = o.product_name || "Sem produto";
    (acc[k] = acc[k] || []).push(o);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Ofertas"
        subtitle="Cada oferta tem um preço único — usado para identificar comprovantes automaticamente"
        actions={
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Nova Oferta
          </button>
        }
      />

      <div className="p-8 space-y-8">
        {offers.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma oferta cadastrada.</p>
        )}

        {Object.entries(grouped).map(([product, items]) => (
          <section key={product}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {product}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((o) => (
                <div key={o.id} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-foreground">{o.name}</h3>
                      {o.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
                      )}
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${o.is_active ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}`}>
                      {o.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-base font-bold text-primary">
                      {fmt(Number(o.price))}
                    </span>
                  </div>

                  {(o.pix_key || o.recipient) && (
                    <div className="mt-4 space-y-1 border-t border-border pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Chave PIX</p>
                      <p className="font-mono text-xs">{o.pix_key || "—"}</p>
                      {o.recipient && <p className="text-xs text-muted-foreground">{o.recipient}</p>}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-3">
                    <button onClick={() => onDelete(o)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-destructive/40 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <button onClick={() => setEditing(o)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/40 hover:text-primary">
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {(creating || editing) && (
        <OfferModal
          offer={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function OfferModal({ offer, onClose, onSaved }: { offer: Offer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(offer?.name || "");
  const [productName, setProductName] = useState(offer?.product_name || "");
  const [description, setDescription] = useState(offer?.description || "");
  const [price, setPrice] = useState<string>(offer ? String(offer.price) : "");
  const [pixKey, setPixKey] = useState(offer?.pix_key || "");
  const [recipient, setRecipient] = useState(offer?.recipient || "");
  const [isActive, setIsActive] = useState(offer?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Nome obrigatório"); return; }
    const num = Number(price.replace(",", "."));
    if (!num || num <= 0) { toast.error("Preço inválido"); return; }

    setSaving(true);
    const payload = {
      name,
      description: description || null,
      product_name: productName || null,
      price: num,
      pix_key: pixKey || null,
      recipient: recipient || null,
      is_active: isActive,
    };
    const { error } = offer
      ? await supabase.from("offers").update(payload).eq("id", offer.id)
      : await supabase.from("offers").insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("Já existe uma oferta com esse preço — cada preço deve ser único.");
      else toast.error(error.message);
    } else {
      toast.success(offer ? "Oferta atualizada" : "Oferta criada");
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{offer ? "Editar Oferta" : "Nova Oferta"}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Produto (grupo)">
            <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ex: Mentoria Premium" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Nome da oferta">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Mentoria Premium - Promo" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Descrição">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Preço (R$) — único por oferta">
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="97.00" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Chave PIX">
              <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Recebedor">
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Ativo
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
