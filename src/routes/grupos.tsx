import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  RefreshCw,
  Crown,
  Calendar,
  AlertCircle,
  MessageSquare,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
} from "lucide-react";
// PageHeader removido: consumia OperationContext indiretamente e quebrava a página.
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { dayMonthYearSP, timeSP } from "@/lib/datetime";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/grupos")({
  component: GruposPage,
});

type Participant = { id: string; phone: string; admin: string | null };
type Group = {
  id: string;
  name: string;
  description: string;
  totalParticipants: number;
  admins: number;
  subject: string;
  subjectOwner: string;
  creation: number;
  pictureUrl: string | null;
  isCommunity: boolean;
  isCommunityAnnounce: boolean;
  participants: Participant[];
};

type GroupsResponse = {
  groups: Group[];
  total: number;
  lastUpdated: string;
  error?: string;
};

type MessagesResponse = {
  messages: { id: string; content: string | null; direction: string; sent_at: string; sent_by: string }[];
  totalMessages: number;
  todayMessages: number;
  weekMessages: number;
};

type GroupEventsResponse = {
  dailyStats: { date: string; adds: number; removes: number; net: number }[];
  totals: { totalAdds: number; totalRemoves: number; netGrowth: number };
  period: number;
};

function formatPhone(p: string): string {
  if (!p) return "—";
  if (p.length === 13 && p.startsWith("55")) {
    return `+55 (${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
  }
  if (p.length === 12 && p.startsWith("55")) {
    return `+55 (${p.slice(2, 4)}) ${p.slice(4, 8)}-${p.slice(8)}`;
  }
  return `+${p}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function GroupAvatar({ group, size = "md" }: { group: Group; size?: "md" | "lg" }) {
  const cls =
    size === "lg" ? "h-16 w-16 text-xl" : "h-12 w-12 text-base";
  if (group.pictureUrl) {
    return (
      <img
        src={group.pictureUrl}
        alt={group.name}
        className={`${cls} rounded-full object-cover ring-1 ring-border`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  const initial = (group.name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className={`${cls} flex items-center justify-center rounded-full bg-primary/15 font-bold text-primary ring-1 ring-primary/30`}
    >
      {initial}
    </div>
  );
}

function GroupsPageInner({
  data,
  isFetching,
  refetch,
  error,
}: {
  data?: GroupsResponse;
  isFetching: boolean;
  refetch: () => void;
  error: unknown;
}) {
  const [open, setOpen] = useState<Group | null>(null);

  const { data: addsToday24h } = useQuery<number>({
    queryKey: ["group-events-adds-24h"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/public/groups/group-events?groupId=__all__&days=1");
        if (!res.ok) return 0;
        const j: GroupEventsResponse = await res.json();
        return j?.totals?.totalAdds ?? 0;
      } catch {
        return 0;
      }
    },
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const summary = useMemo(() => {
    const groups = data?.groups ?? [];
    const totalGroups = groups.length;
    const totalParticipants = groups.reduce((a, g) => a + (g.totalParticipants || 0), 0);
    const biggest = groups.reduce<Group | null>(
      (acc, g) => (!acc || g.totalParticipants > acc.totalParticipants ? g : acc),
      null,
    );
    const communities = groups.filter((g) => g.isCommunity).length;
    return { totalGroups, totalParticipants, biggest, communities };
  }, [data]);



  return (
    <>
      <header className="flex items-center justify-between border-b border-border/40 bg-card/30 px-8 py-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dash Grupos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.lastUpdated
              ? `Atualizado ${relativeTime(data.lastUpdated)}`
              : "Painel de grupos do WhatsApp"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>


      <div className="space-y-6 px-8 py-6">
        {/* Banner de erro */}
        {error || data?.error ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Não foi possível conectar à Evolution API.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Verifique se a instância DashWhats está conectada.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Grupos (admin)"
            value={summary.totalGroups}
            icon={<Users className="h-4 w-4 text-primary" />}
          />
          <SummaryCard
            label="Participantes (total)"
            value={summary.totalParticipants}
            icon={<Users className="h-4 w-4 text-primary" />}
          />
          <SummaryCard
            label="Maior grupo"
            value={summary.biggest ? summary.biggest.totalParticipants : 0}
            sub={summary.biggest?.name}
            icon={<Crown className="h-4 w-4 text-primary" />}
          />
          <SummaryCard
            label="Comunidades"
            value={summary.communities}
            icon={<Sparkles className="h-4 w-4 text-primary" />}
          />
        </div>

        {/* Lista de grupos */}
        {!data && !error ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ) : data && data.groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Nenhum grupo encontrado
              </p>
              <p className="text-xs text-muted-foreground">
                Você não é admin de nenhum grupo nesta instância.
              </p>
              {(data?.error || error) ? (
                <p className="mt-2 max-w-md text-xs text-destructive">
                  {String(data?.error || (error instanceof Error ? error.message : error) || "")}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] text-muted-foreground">
                API respondeu total = {data?.total ?? 0}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(data?.groups ?? []).map((g) => (
              <Card key={g.id} className="overflow-hidden">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <GroupAvatar group={g} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {g.name}
                        </h3>
                        {g.isCommunity && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Comunidade
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {g.creation
                          ? dayMonthYearSP(new Date(g.creation * 1000))
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {g.totalParticipants}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Crown className="h-3.5 w-3.5" />
                      {g.admins} admin{g.admins === 1 ? "" : "s"}
                    </span>
                  </div>

                  {g.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {g.description}
                    </p>
                  )}

                  <div className="mt-auto pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setOpen(g)}
                    >
                      Ver detalhes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <GroupDetailsDialog group={open} onClose={() => setOpen(null)} />
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  extra,
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  extra?: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && (
          <div className="truncate text-[11px] text-muted-foreground" title={sub}>
            {sub}
          </div>
        )}
        {extra}
      </CardContent>
    </Card>
  );
}


function GroupDetailsDialog({
  group,
  onClose,
}: {
  group: Group | null;
  onClose: () => void;
}) {
  const { data: msgs, isLoading: msgsLoading } = useQuery<MessagesResponse>({
    queryKey: ["group-messages", group?.id],
    enabled: !!group,
    queryFn: async () => {
      const res = await fetch(
        `/api/public/groups/group-messages?groupId=${encodeURIComponent(group!.id)}&limit=50`,
      );
      if (!res.ok) throw new Error("Falha ao buscar mensagens");
      return res.json();
    },
  });

  if (!group) return null;

  return (
    <Dialog open={!!group} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <GroupAvatar group={group} size="lg" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                <span className="truncate">{group.name}</span>
                {group.isCommunity && (
                  <Badge variant="secondary" className="text-[10px]">
                    Comunidade
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Criado em{" "}
                {group.creation
                  ? dayMonthYearSP(new Date(group.creation * 1000))
                  : "—"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="participants">
              Participantes ({group.participants.length})
            </TabsTrigger>
            <TabsTrigger value="activity">Atividade</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {group.description ? (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">Sem descrição.</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniMetric label="Participantes" value={group.totalParticipants} />
              <MiniMetric label="Admins" value={group.admins} />
              <MiniMetric label="Mensagens hoje" value={msgs?.todayMessages ?? 0} />
              <MiniMetric label="Mensagens 7d" value={msgs?.weekMessages ?? 0} />
            </div>
          </TabsContent>

          <TabsContent value="participants">
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <ul className="divide-y divide-border">
                {group.participants.map((p) => {
                  const isAdmin = p.admin === "admin" || p.admin === "superadmin";
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-foreground">
                        {formatPhone(p.phone)}
                      </span>
                      {isAdmin ? (
                        <Badge className="bg-primary/20 text-primary hover:bg-primary/20">
                          <Crown className="mr-1 h-3 w-3" />
                          {p.admin === "superadmin" ? "Dono" : "Admin"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Membro
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            {msgsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !msgs || msgs.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-10 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Mensagens de grupos não são processadas pelo CRM.
                </p>
              </div>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {msgs.messages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-md border border-border bg-card/50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{m.sent_by || "—"}</span>
                      <span>{timeSP(m.sent_at)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-foreground">
                      {m.content || <em className="text-muted-foreground">(sem conteúdo)</em>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function GruposPage() {
  const { data, isFetching, refetch, error } = useQuery<GroupsResponse>({
    queryKey: ["dash-grupos"],
    queryFn: async () => {
      const res = await fetch("/api/public/groups/fetch-groups");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao buscar grupos");
      return json;
    },
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // garante "refresh sutil" via isFetching já passado
  useEffect(() => {}, [data]);

  return (
    <GroupsPageInner
      data={data}
      isFetching={isFetching}
      refetch={refetch}
      error={error}
    />
  );
}
