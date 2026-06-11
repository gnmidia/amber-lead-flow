import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { useEffect, useState } from "react";
import { RefreshCw, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useOperation } from "@/contexts/OperationContext";

export const Route = createFileRoute("/chat-baileys")({
  component: ChatBaileysPage,
});

type ConnState = "open" | "connecting" | "close" | "unknown";

const STATE_BADGE: Record<ConnState, { cls: string; label: string }> = {
  open: { cls: "border-success/40 bg-success/10 text-success", label: "Conectado" },
  connecting: { cls: "border-warning/40 bg-warning/10 text-warning animate-pulse", label: "Conectando…" },
  close: { cls: "border-destructive/40 bg-destructive/10 text-destructive", label: "Desconectado" },
  unknown: { cls: "border-border bg-muted/20 text-muted-foreground", label: "Desconhecido" },
};

function ChatBaileysPage() {
  const { currentOperationId } = useOperation();
  const [state, setState] = useState<ConnState>("unknown");
  const [qr, setQr] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const opQuery = currentOperationId ? `&operation=${currentOperationId}` : "";

  const checkState = async () => {
    try {
      const res = await fetch(`/api/public/evolution-status?action=state${opQuery}`);
      const json = await res.json();
      const s = (json?.instance?.state ?? json?.state ?? "unknown") as ConnState;
      setState(s);
      if (s === "open") setQr(null);
    } catch {
      setState("unknown");
    }
  };

  const fetchQr = async () => {
    setLoadingQr(true);
    try {
      const res = await fetch(`/api/public/evolution-status?action=connect${opQuery}`);
      const json = await res.json();
      const base64 = json?.base64 ?? json?.qrcode?.base64 ?? null;
      if (!base64) throw new Error("QR Code não retornado");
      setQr(base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`);
      setState("connecting");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingQr(false);
    }
  };

  useEffect(() => {
    setQr(null);
    setState("unknown");
    checkState();
    const id = setInterval(checkState, 15000);
    return () => clearInterval(id);
    // Refaz a leitura ao trocar de operação (cada uma tem sua instância).
  }, [currentOperationId]);

  const badge = STATE_BADGE[state];

  return (
    <>
      <PageHeader title="Chat Baileys" subtitle="Conexão técnica Evolution / Baileys" />
      <div className="space-y-6 p-8">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status da instância</p>
              <span className={`mt-2 inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={checkState} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </button>
              {state !== "open" && (
                <button onClick={fetchQr} disabled={loadingQr}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  <QrCode className="h-3.5 w-3.5" /> {loadingQr ? "Gerando…" : qr ? "Gerar novo QR" : "Conectar"}
                </button>
              )}
            </div>
          </div>

          {qr && state !== "open" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-md border border-border bg-background p-6">
              <img src={qr} alt="QR Code WhatsApp" className="h-64 w-64 rounded-md bg-white p-2" />
              <p className="text-xs text-muted-foreground">Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
