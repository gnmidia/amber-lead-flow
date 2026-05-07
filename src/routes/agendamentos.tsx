import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, RefreshCw } from "lucide-react";
import { dateTimeSP } from "@/lib/datetime";

export const Route = createFileRoute("/agendamentos")({
  component: AgendamentosPage,
});

type QueueRow = {
  id: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  file_name: string | null;
  send_at: string;
  status: string;
  attempts: number;
  error_message: string | null;
  leads: { name: string | null; push_name: string | null; whatsapp_number: string } | null;
  funnels: { name: string } | null;
};

const TYPE_LABEL: Record<string, string> = {
  text: "Texto", texto: "Texto",
  audio: "Áudio", "áudio": "Áudio",
  image: "Imagem", imagem: "Imagem",
  video: "Vídeo",
  document: "Documento", documento: "Documento",
  tag: "Tag",
  flow_resume: "Fluxo",
};

const TYPE_COLOR: Record<string, string> = {
  Texto: "bg-info/10 text-info border-info/30",
  Áudio: "bg-primary/10 text-primary border-primary/30",
  Imagem: "bg-success/10 text-success border-success/30",
  Vídeo: "bg-success/10 text-success border-success/30",
  Documento: "bg-muted text-muted-foreground border-border",
  Tag: "bg-secondary text-secondary-foreground border-border",
  Fluxo: "bg-primary/10 text-primary border-primary/30",
};

function STATUS_BADGE(status: string) {
  if (status === "pending") return "border-border bg-muted text-muted-foreground";
  if (status === "sent") return "border-success/30 bg-success/10 text-success";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "cancelled") return "border-border bg-muted text-muted-foreground line-through";
  return "border-border bg-muted text-muted-foreground";
}

function fmtDate(iso: string) {
  return dateTimeSP(iso);
}

function AgendamentosPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "failed">("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scheduled_messages")
      .select(`
        id, message_type, content, media_url, file_name,
        send_at, status, attempts, error_message,
        leads ( name, push_name, whatsapp_number ),
        funnels ( name )
      `)
      .order("send_at", { ascending: true })
      .limit(200);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as any);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("queue-monitor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_messages" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const cancel = async (id: string) => {
    if (!confirm("Cancelar este envio?")) return;
    const { error } = await supabase
      .from("scheduled_messages")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Envio cancelado");
  };

  const filtered = rows.filter((r) => filter === "all" || r.status === filter);
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  return (
    <>
      <PageHeader
        title="Agendamentos"
        subtitle="Fila de envios em tempo real"
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        }
      />

      <div className="space-y-4 p-8">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "sent", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filter === s
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Todos" : s === "pending" ? "Pendentes" : s === "sent" ? "Enviados" : "Falhas"}
              <span className="ml-1.5 text-[10px] opacity-70">({counts[s]})</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background/40 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Funil</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Conteúdo</th>
                  <th className="px-4 py-3">Envio previsto</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Tent.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-xs text-muted-foreground">
                      Nenhuma mensagem na fila.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const label = TYPE_LABEL[r.message_type] ?? r.message_type;
                  const color = TYPE_COLOR[label] ?? "bg-muted text-muted-foreground border-border";
                  const preview =
                    (r.content ?? r.file_name ?? "—").slice(0, 40) +
                    ((r.content?.length ?? 0) > 40 ? "…" : "");
                  return (
                    <tr key={r.id} className="hover:bg-background/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {r.leads?.push_name || r.leads?.name || "—"}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          +{r.leads?.whatsapp_number}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.funnels?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${color}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        {preview}
                        {r.error_message && (
                          <p className="mt-1 truncate text-[10px] text-destructive" title={r.error_message}>
                            ⚠ {r.error_message.slice(0, 60)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {fmtDate(r.send_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {r.attempts}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === "pending" && (
                          <button
                            onClick={() => cancel(r.id)}
                            className="rounded-md border border-border p-1.5 text-destructive hover:border-destructive/40"
                            title="Cancelar envio"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
