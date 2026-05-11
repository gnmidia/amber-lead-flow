import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Lead = {
  id: string;
  name?: string | null;
  push_name?: string | null;
  whatsapp_number: string;
};

type Offer = { id: string; name: string; price: number };

export function SaleModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { currentOperationId } = useOperation();
  const qc = useQueryClient();

  const [offerId, setOfferId] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { data: offers = [] } = useQuery({
    queryKey: ["offers-list", currentOperationId],
    enabled: !!currentOperationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, name, price")
        .eq("operation_id", currentOperationId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Offer[];
    },
  });

  useEffect(() => {
    const offer = offers.find((o) => o.id === offerId);
    if (offer) setAmount(String(offer.price));
  }, [offerId, offers]);

  const submit = async () => {
    if (!offerId) return toast.error("Selecione uma oferta");
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (!currentOperationId) return toast.error("Operação não selecionada");

    setSubmitting(true);
    try {
      const { error } = await supabase.from("sales" as any).insert({
        operation_id: currentOperationId,
        lead_id: lead.id,
        offer_id: offerId,
        amount: value,
        sale_date: format(saleDate, "yyyy-MM-dd"),
        notes: notes || null,
      });
      if (error) throw error;
      toast.success("Venda registrada com sucesso");
      qc.invalidateQueries({ queryKey: ["sales-summary"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Registrar Venda</h2>
            <p className="text-xs text-muted-foreground">{lead.name ?? lead.push_name ?? lead.whatsapp_number}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Oferta</label>
            <select
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{o.name} — R$ {Number(o.price).toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Data da Venda</label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm",
                  )}
                >
                  {format(saleDate, "dd/MM/yyyy", { locale: ptBR })}
                  <CalendarIcon className="h-4 w-4 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={saleDate}
                  onSelect={(d) => { if (d) { setSaleDate(d); setPopoverOpen(false); } }}
                  disabled={(d) => d > new Date()}
                  locale={ptBR}
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Salvando…" : "Registrar venda"}
          </button>
        </div>
      </div>
    </div>
  );
}
