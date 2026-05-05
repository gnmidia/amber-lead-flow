import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Search, Archive, Send, Paperclip, Mic, Pause, Play } from "lucide-react";

export const Route = createFileRoute("/chat-oficial")({
  component: ChatOficialPage,
});

const leads = [
  { id: "l1", name: "Marina Silva", phone: "+55 11 98765-4321", initials: "MS", tags: ["Cliente", "SEND_UPSELL"], preview: "Show, vou pagar agora!", time: "14:32", aiActive: true },
  { id: "l2", name: "Ricardo Alves", phone: "+55 21 99887-6655", initials: "RA", tags: ["LEAD_NOVO"], preview: "Posso saber mais?", time: "14:18", aiActive: true },
  { id: "l3", name: "Juliana Costa", phone: "+55 31 98123-4567", initials: "JC", tags: ["ENVIO_LIST", "Sim"], preview: "Quanto custa?", time: "13:55", aiActive: false },
  { id: "l4", name: "Pedro Henrique", phone: "+55 41 97766-5544", initials: "PH", tags: ["Recorrente"], preview: "Obrigado!", time: "12:40", aiActive: true },
  { id: "l5", name: "Ana Beatriz", phone: "+55 51 96655-4433", initials: "AB", tags: ["LEAD_NOVO", "Teste"], preview: "Oi tudo bem?", time: "11:20", aiActive: true },
];

const messages = [
  { id: 1, from: "lead", text: "Oi, vi o anúncio sobre a mentoria", time: "14:25" },
  { id: 2, from: "ai", text: "Olá Marina! Que ótimo que veio falar comigo 🙌 Posso te explicar como funciona?", time: "14:25" },
  { id: 3, from: "lead", text: "Sim, por favor", time: "14:26" },
  { id: 4, from: "ai", text: "São encontros 1:1 semanais por 3 meses, com plano personalizado. O investimento é de R$ 297,00", time: "14:27" },
  { id: 5, from: "lead", text: "Show, vou pagar agora!", time: "14:32" },
];

function ChatOficialPage() {
  const [active, setActive] = useState(leads[0]);
  const [paused, setPaused] = useState(false);

  return (
    <>
      <PageHeader title="Chat Oficial" subtitle={`Todas as histórias (${leads.length})`} />

      <div className="grid h-[calc(100vh-97px)] grid-cols-[360px_1fr] overflow-hidden">
        {/* Inbox */}
        <aside className="flex flex-col border-r border-border bg-card/40">
          <div className="space-y-3 border-b border-border p-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Buscar por nome ou telefone..."
                className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              <Chip active>Janela 34h</Chip>
              <Chip>Agendados <span className="ml-1 text-primary">102</span></Chip>
              <Chip><Archive className="h-3 w-3" /> Arquivo</Chip>
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {leads.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => setActive(l)}
                  className={`flex w-full items-start gap-3 border-b border-border/50 p-4 text-left transition-colors hover:bg-muted/30 ${
                    active.id === l.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {l.initials}
                    </div>
                    {l.aiActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{l.name}</p>
                      <span className="text-[10px] text-muted-foreground">{l.time}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {l.tags.map((t) => (
                        <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{l.preview}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Conversa */}
        <section className="flex flex-col">
          <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
            <div>
              <h2 className="text-sm font-semibold">{active.name}</h2>
              <p className="text-xs text-muted-foreground">{active.phone}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${
                  paused
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-success/30 bg-success/10 text-success"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-destructive" : "bg-success animate-pulse"}`} />
                {paused ? "IA Pausada" : "IA Ativa"}
              </span>
              <button
                onClick={() => setPaused((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/40"
              >
                {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {paused ? "Retomar" : "Pausar"}
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-background/40 p-6">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === "lead" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                    m.from === "lead"
                      ? "rounded-bl-sm bg-card text-foreground"
                      : "rounded-br-sm bg-primary text-primary-foreground"
                  }`}
                >
                  <p>{m.text}</p>
                  <p className={`mt-1 text-[10px] ${m.from === "lead" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                    {m.time}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {paused && (
            <footer className="border-t border-border bg-card p-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <button className="text-muted-foreground hover:text-primary"><Paperclip className="h-4 w-4" /></button>
                <input
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <button className="text-muted-foreground hover:text-primary"><Mic className="h-4 w-4" /></button>
                <button className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </footer>
          )}
        </section>
      </div>
    </>
  );
}

function Chip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
