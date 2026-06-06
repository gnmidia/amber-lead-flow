import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Search, Archive, Send, Paperclip, Mic, Pause, Play, RefreshCw, FileText, Plus, Check, Tag as TagIcon, X, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { timeSP, dayMonthSP, dayMonthYearSP, ymdSP } from "@/lib/datetime";
import { useOperation } from "@/contexts/OperationContext";

export const Route = createFileRoute("/chat-oficial")({
  component: ChatOficialPage,
});

type TagItem = { id: string; name: string; color: string };

type Lead = {
  id: string;
  name: string | null;
  push_name: string | null;
  whatsapp_number: string;
  tags: string[];
  tags_data: TagItem[] | null;
  status: string;
  ia_paused: boolean;
  updated_at: string;
  instance_name: string | null;
  last_message_content: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
};

type Message = {
  id: string;
  lead_id: string;
  direction: "inbound" | "outbound";
  type: string;
  content: string | null;
  media_url: string | null;
  file_name: string | null;
  is_ai: boolean;
  sent_by: string;
  sent_at: string;
};

type Filter = "all" | "window34" | "scheduled" | "archived";

function formatTime(iso?: string | null) {
  if (!iso) return "";
  return timeSP(iso);
}

function formatConversationTime(dateString?: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const dateYmd = ymdSP(date);
  const nowYmd = ymdSP(now);
  if (dateYmd === nowYmd) return timeSP(date);
  // mesmo ano em SP?
  const sameYear = dateYmd.slice(0, 4) === nowYmd.slice(0, 4);
  if (sameYear) return dayMonthSP(date);
  return dayMonthYearSP(date);
}

function initialsOf(name: string | null, number: string) {
  const base = (name || number).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function previewOf(l: Lead) {
  if (l.last_message_type && l.last_message_type !== "text") {
    return `[${l.last_message_type}]`;
  }
  return l.last_message_content || "—";
}

function ChatOficialPage() {
  const { currentOperationId } = useOperation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [unreadLeads, setUnreadLeads] = useState<Set<string>>(new Set());
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  // Bump deste contador força a recriação dos canais de realtime (workaround
  // do bug em que o socket reconecta mas não se reinscreve nos postgres_changes).
  const [realtimeEpoch, setRealtimeEpoch] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const fetchAllTags = async () => {
    if (!currentOperationId) return;
    const { data } = await supabase
      .from("tags")
      .select("id,name,color")
      .eq("is_active", true)
      .eq("operation_id", currentOperationId)
      .order("name");
    setAllTags((data || []) as TagItem[]);
  };

  const active = leads.find((l) => l.id === activeId) || null;

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("leads_with_last_message" as any)
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) {
      console.error(error);
      return;
    }
    setLeads(((data || []) as unknown) as Lead[]);
  };

  const fetchScheduled = async () => {
    const { data } = await supabase
      .from("scheduled_messages")
      .select("lead_id")
      .eq("status", "pending");
    setScheduledIds(new Set((data || []).map((r: any) => r.lead_id)));
  };

  const fetchMessages = async (leadId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: false })
      .limit(200);
    setMessages(((data || []) as Message[]).slice().reverse());
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  };

  // Initial load
  useEffect(() => {
    if (!currentOperationId) return;
    fetchLeads();
    fetchScheduled();
    fetchAllTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOperationId]);

  // Realtime: messages → refresh leads list & scheduled count
  useEffect(() => {
    const ch = supabase
      .channel("chat-oficial-leads")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.lead_id && msg.lead_id !== activeIdRef.current && msg.direction === "inbound") {
          setUnreadLeads((prev) => new Set(prev).add(msg.lead_id));
        }
        fetchLeads();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        fetchLeads();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        fetchLeads();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_messages" }, () => {
        fetchScheduled();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_tags" }, () => {
        fetchLeads();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tags" }, () => {
        fetchAllTags();
        fetchLeads();
      })
      .subscribe((status) => {
        setIsRealtimeConnected(status === "SUBSCRIBED");
        // Se o canal cair/expirar, recarrega os dados e força recriação do canal.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          fetchLeads();
          fetchScheduled();
          setTimeout(() => setRealtimeEpoch((e) => e + 1), 1000);
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [realtimeEpoch]);

  // Active conversation: load + realtime
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    fetchMessages(activeId);
    const ch = supabase
      .channel(`chat-msgs-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `lead_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeId, realtimeEpoch]);

  // Recuperação + rede de segurança. Quando a aba volta ao foco / a internet
  // reconecta, recarrega tudo e recria os canais (cobre as mensagens perdidas
  // enquanto a aba esteve em segundo plano). Também faz um polling leve a cada
  // 20s como fallback caso o WebSocket falhe silenciosamente.
  useEffect(() => {
    if (!currentOperationId) return;

    const refreshAll = () => {
      fetchLeads();
      fetchScheduled();
      if (activeIdRef.current) fetchMessages(activeIdRef.current);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshAll();
        setRealtimeEpoch((e) => e + 1); // recria os canais de realtime
      }
    };
    const onOnline = () => {
      refreshAll();
      setRealtimeEpoch((e) => e + 1);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisible);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refreshAll();
    }, 20000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisible);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOperationId]);

  const filtered = useMemo(() => {
    let list = leads;
    if (filter === "window34") {
      const cutoff = Date.now() - 34 * 60 * 60 * 1000;
      list = list.filter((l) => new Date(l.updated_at).getTime() >= cutoff);
    } else if (filter === "scheduled") {
      list = list.filter((l) => scheduledIds.has(l.id));
    } else if (filter === "archived") {
      list = list.filter((l) => l.status === "archived");
    } else {
      list = list.filter((l) => l.status !== "archived");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.push_name?.toLowerCase().includes(q) ||
          l.whatsapp_number.includes(search)
      );
    }
    if (tagFilter.size > 0) {
      list = list.filter((l) => {
        const ids = (l.tags_data || []).map((t) => t.id);
        // OR: lead aparece se possuir QUALQUER uma das tags selecionadas
        for (const id of ids) if (tagFilter.has(id)) return true;
        return false;
      });
    }
    return list;
  }, [leads, filter, scheduledIds, search, tagFilter]);

  const handleSync = async () => {
    if (!currentOperationId) {
      toast.error("Selecione uma operação antes de sincronizar");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/public/sync-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation_id: currentOperationId }),
      });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      if (res.ok && json) {
        toast.success(`Sincronizados ${json.synced} chats`);
        fetchLeads();
      } else if (res.status === 504) {
        toast.error("Sincronização demorou demais. Tente novamente em alguns segundos.");
      } else {
        toast.error((json && json.error) || text || `Erro ${res.status}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const togglePause = async () => {
    if (!active) return;
    await supabase.from("leads").update({ ia_paused: !active.ia_paused }).eq("id", active.id);
    setLeads((prev) =>
      prev.map((l) => (l.id === active.id ? { ...l, ia_paused: !l.ia_paused } : l))
    );
  };

  const sendMessage = async () => {
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      const res = await fetch("/api/public/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: active.id,
          number: active.whatsapp_number,
          type: "text",
          content: text,
          instance: active.instance_name,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error("Falha no envio");
        setDraft(text);
      } else {
        await supabase.from("messages").insert({
          lead_id: active.id,
          direction: "outbound",
          type: "text",
          content: text,
          is_ai: false,
          sent_by: "manual",
          evolution_message_id: json.evolution_message_id || null,
          sent_at: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      toast.error(e.message);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const scheduledCount = scheduledIds.size;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <div className="relative">
        <PageHeader title="Chat Oficial" subtitle={`Todas as histórias (${filtered.length})`} />
        {isRealtimeConnected && (
          <span className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Ao vivo
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] overflow-hidden">
        {/* Inbox */}
        <aside className="flex min-h-0 flex-col border-r border-border bg-card/40">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou telefone..."
                  className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Sincronizar conversas"
                className="rounded-md border border-border bg-background p-2 text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                <Chip active={filter === "window34"} onClick={() => setFilter(filter === "window34" ? "all" : "window34")}>
                  Janela 34h
                </Chip>
                <Chip active={filter === "scheduled"} onClick={() => setFilter(filter === "scheduled" ? "all" : "scheduled")}>
                  Agendados <span className="ml-1 text-primary">{scheduledCount}</span>
                </Chip>
                <Chip active={filter === "archived"} onClick={() => setFilter(filter === "archived" ? "all" : "archived")}>
                  <Archive className="h-3 w-3" /> Arquivo
                </Chip>
              </div>
              <div className="shrink-0">
                <TagFilterDropdown allTags={allTags} selected={tagFilter} onChange={setTagFilter} />
              </div>
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa.</li>
            )}
            {filtered.map((l) => {
              const isNew = l.tags?.includes("LEAD_NOVO");
              const isUnread = unreadLeads.has(l.id);
              const display = l.push_name || l.name || l.whatsapp_number;
              return (
                <li key={l.id}>
                  <button
                    onClick={() => {
                      setActiveId(l.id);
                      setUnreadLeads((prev) => {
                        if (!prev.has(l.id)) return prev;
                        const next = new Set(prev);
                        next.delete(l.id);
                        return next;
                      });
                    }}
                    className={`flex w-full items-start gap-3 border-b border-border/50 p-4 text-left transition-colors hover:bg-muted/30 ${
                      activeId === l.id ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="relative">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {initialsOf(display, l.whatsapp_number)}
                      </div>
                      {(isUnread || isNew) && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-orange-500 animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{display}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {formatConversationTime(l.last_message_at || l.updated_at)}
                        </span>
                      </div>
                      {(l.tags_data?.length || 0) > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {l.tags_data!.slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              style={{ backgroundColor: t.color + "33", color: t.color, borderColor: t.color }}
                              className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-1 truncate text-xs text-muted-foreground">{previewOf(l)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Conversa */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center justify-between border-b border-border bg-background px-6 py-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {active.push_name || active.name || active.whatsapp_number}
                  </h2>
                  <p className="text-xs text-muted-foreground">+{active.whatsapp_number}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ActivateFlowButton leadId={active.id} />
                  <ActivateAgentButton leadId={active.id} />
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${
                      active.ia_paused
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-success/30 bg-success/10 text-success"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active.ia_paused ? "bg-destructive" : "bg-success animate-pulse"
                      }`}
                    />
                    {active.ia_paused ? "IA Pausada" : "IA Ativa"}
                  </span>
                  <button
                    onClick={togglePause}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/40"
                  >
                    {active.ia_paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                    {active.ia_paused ? "Retomar" : "Pausar"}
                  </button>
                </div>
              </header>

              <LeadTagsArea
                leadId={active.id}
                leadTags={active.tags_data || []}
                allTags={allTags}
              />

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background/40 p-6">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "inbound" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                        m.direction === "inbound"
                          ? "rounded-bl-sm bg-card text-foreground"
                          : "rounded-br-sm bg-primary text-primary-foreground"
                      }`}
                    >
                      <MessageBody m={m} />
                      <p
                        className={`mt-1 text-[10px] ${
                          m.direction === "inbound"
                            ? "text-muted-foreground"
                            : "text-primary-foreground/70"
                        }`}
                      >
                        {formatTime(m.sent_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground">Sem mensagens.</p>
                )}
              </div>

              <footer className="shrink-0 border-t border-border bg-card p-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <button className="text-muted-foreground hover:text-primary">
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={active.ia_paused ? "Digite sua mensagem..." : "Pause a IA para enviar manualmente, ou envie assim mesmo..."}
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <button className="text-muted-foreground hover:text-primary">
                    <Mic className="h-4 w-4" />
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={sending || !draft.trim()}
                    className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MessageBody({ m }: { m: Message }) {
  if (m.type === "image" && m.media_url) {
    return (
      <div>
        <img src={m.media_url} alt="" className="max-h-[200px] rounded" />
        {m.content && <p className="mt-1">{m.content}</p>}
      </div>
    );
  }
  if (m.type === "audio" && m.media_url) {
    return <audio controls src={m.media_url} className="max-w-full" />;
  }
  if (m.type === "video" && m.media_url) {
    return <video controls src={m.media_url} className="max-h-[240px] rounded" />;
  }
  if (m.type === "document" && m.media_url) {
    return (
      <a href={m.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
        <FileText className="h-4 w-4" />
        {m.file_name || "documento"}
      </a>
    );
  }
  return <p className="whitespace-pre-wrap">{m.content || ""}</p>;
}

function ActivateFlowButton({ leadId }: { leadId: string }) {
  const { currentOperationId } = useOperation();
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    if (!currentOperationId) return;
    supabase
      .from("flows")
      .select("id, name")
      .eq("operation_id", currentOperationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setFlows(data ?? []));
  }, [currentOperationId]);

  const refreshPending = async () => {
    const { data } = await supabase
      .from("scheduled_messages")
      .select("id")
      .eq("lead_id", leadId)
      .eq("message_type", "flow_resume")
      .eq("status", "pending")
      .limit(1);
    setHasPending((data?.length ?? 0) > 0);
  };

  useEffect(() => {
    refreshPending();
  }, [leadId]);

  const activate = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/flow-executor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, flow_id: selected }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Erro ao ativar fluxo");
      toast.success("Fluxo ativado");
      setSelected("");
      refreshPending();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const pause = async () => {
    setPausing(true);
    try {
      const { error } = await supabase
        .from("scheduled_messages")
        .delete()
        .eq("lead_id", leadId)
        .eq("message_type", "flow_resume")
        .eq("status", "pending");
      if (error) throw error;
      toast.success("Fluxo pausado");
      refreshPending();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPausing(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        <option value="">Ativar fluxo…</option>
        {flows.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <button
        onClick={activate}
        disabled={!selected || loading}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Play className="h-3 w-3" />
        {loading ? "..." : "Ativar"}
      </button>
      {hasPending && (
        <button
          onClick={pause}
          disabled={pausing}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          <Pause className="h-3 w-3" />
          {pausing ? "..." : "Pausar fluxo"}
        </button>
      )}
    </div>
  );
}

type AgentItem = { id: string; name: string; objective: string | null };

function ActivateAgentButton({ leadId }: { leadId: string }) {
  const { currentOperationId } = useOperation();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [activeAgent, setActiveAgent] = useState<{ agent_id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshActive = async () => {
    const { data } = await supabase
      .from("lead_active_agents")
      .select("agent_id, agents(name)")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (data) {
      setActiveAgent({ agent_id: (data as any).agent_id, name: (data as any).agents?.name || "Agente" });
    } else {
      setActiveAgent(null);
    }
  };

  useEffect(() => {
    if (!currentOperationId) return;
    supabase
      .from("agents")
      .select("id, name, objective")
      .eq("operation_id", currentOperationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setAgents((data ?? []) as AgentItem[]));
  }, [currentOperationId]);

  useEffect(() => {
    refreshActive();
    const ch = supabase
      .channel(`lead-active-agent-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_active_agents", filter: `lead_id=eq.${leadId}` },
        () => refreshActive()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const activate = async (agent: AgentItem) => {
    setBusy(true);
    try {
      await supabase.from("lead_active_agents").delete().eq("lead_id", leadId);
      const { error } = await supabase.from("lead_active_agents").insert({
        lead_id: leadId,
        agent_id: agent.id,
        flow_id: null,
        resume_block_index: 0,
        turn_count: 0,
      });
      if (error) throw error;
      toast.success(`Agente ${agent.name} ativado`);
      setOpen(false);
      refreshActive();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("lead_active_agents").delete().eq("lead_id", leadId);
      if (error) throw error;
      toast.success("Agente desativado");
      refreshActive();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5">
      {activeAgent && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
          <Bot className="h-3 w-3" />
          IA Ativa: {activeAgent.name}
        </span>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-50"
      >
        <Bot className="h-3 w-3" />
        {activeAgent ? "Trocar agente" : "Ativar Agente"}
      </button>
      {activeAgent && (
        <button
          onClick={deactivate}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          <Pause className="h-3 w-3" />
          Desativar
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-lg">
            {agents.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">Nenhum agente ativo na operação.</p>
            )}
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 rounded p-2 hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{a.name}</p>
                  {a.objective && (
                    <p className="line-clamp-2 text-[10px] text-muted-foreground">{a.objective}</p>
                  )}
                </div>
                <button
                  onClick={() => activate(a)}
                  disabled={busy || activeAgent?.agent_id === a.id}
                  className="shrink-0 rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {activeAgent?.agent_id === a.id ? "Ativo" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
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

function TagFilterDropdown({
  allTags,
  selected,
  onChange,
}: {
  allTags: TagItem[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
          selected.size > 0
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        <TagIcon className="h-3 w-3" />
        {selected.size > 0 ? `${selected.size} tag(s)` : "Filtrar tag"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
            {allTags.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">Sem tags.</p>
            )}
            {allTags.map((t) => {
              const sel = selected.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="flex-1 font-medium">{t.name}</span>
                  {sel && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
            {selected.size > 0 && (
              <button
                onClick={() => onChange(new Set())}
                className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
              >
                Limpar filtro
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LeadTagsArea({
  leadId,
  leadTags,
  allTags,
}: {
  leadId: string;
  leadTags: TagItem[];
  allTags: TagItem[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [localTags, setLocalTags] = useState<TagItem[]>(leadTags);

  useEffect(() => {
    setLocalTags(leadTags);
  }, [leadId, leadTags]);

  const assignedIds = new Set(localTags.map((t) => t.id));

  const assign = async (tag: TagItem) => {
    setLocalTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    const { error } = await supabase.from("lead_tags").upsert(
      { lead_id: leadId, tag_id: tag.id, assigned_by: "manual" },
      { onConflict: "lead_id,tag_id", ignoreDuplicates: true }
    );
    if (error) {
      setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
      toast.error("Erro ao adicionar tag");
    }
  };
  const remove = async (tag: TagItem) => {
    setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
    const { error } = await supabase
      .from("lead_tags")
      .delete()
      .eq("lead_id", leadId)
      .eq("tag_id", tag.id);
    if (error) {
      setLocalTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      toast.error("Erro ao remover tag");
    }
  };
  const toggle = async (tag: TagItem) => {
    if (assignedIds.has(tag.id)) await remove(tag);
    else await assign(tag);
  };

  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background/60 px-6 py-2">
      {localTags.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t)}
          title="Clique para remover"
          style={{ backgroundColor: t.color + "33", color: t.color, borderColor: t.color }}
          className="group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase"
        >
          {t.name}
          <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> Tag
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-md border border-border bg-popover p-2 shadow-lg">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tag..."
                className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
              <div className="max-h-48 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">Nenhuma tag.</p>
                )}
                {filtered.map((t) => {
                  const sel = assignedIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="flex-1 font-medium">{t.name}</span>
                      {sel && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
