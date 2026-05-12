import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useOperation } from "@/contexts/OperationContext";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, ShieldCheck } from "lucide-react";
import {
  LayoutDashboard,
  TrendingUp,
  Sparkles,
  GitBranch,
  CalendarClock,
  Package,
  Workflow,
  Bot,
  ListOrdered,
  MessageSquare,
  MessagesSquare,
  ReceiptText,
  Brain,
  Megaphone,
  CheckSquare,
  ArrowLeftRight,
  Users,
  UserSquare2,
  Wallet,
  Tag,
  Send,
  ChevronsUpDown,
  Check,
  Cpu,
  Building2,
} from "lucide-react";

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { title: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    title: "Principal",
    items: [
      { label: "Overview", to: "/overview", icon: LayoutDashboard },
      { label: "Projeção", to: "/projecao", icon: TrendingUp },
      { label: "Jarvis", to: "/jarvis", icon: Sparkles },
    ],
  },
  {
    title: "Funil",
    items: [
      { label: "Funil", to: "/funil", icon: GitBranch },
      { label: "Agendamentos", to: "/agendamentos", icon: CalendarClock },
    ],
  },
  {
    title: "Automações",
    items: [
      { label: "Ofertas", to: "/ofertas", icon: Package },
      { label: "Fluxos", to: "/fluxos", icon: Workflow },
      { label: "Disparos", to: "/disparos", icon: Send },
      { label: "Agentes IA", to: "/agentes-ia", icon: Bot },
    ],
  },
  {
    title: "Operações",
    items: [
      { label: "Fila", to: "/fila", icon: ListOrdered },
      { label: "Chat Oficial", to: "/chat-oficial", icon: MessageSquare },
      { label: "Chat Baileys", to: "/chat-baileys", icon: MessagesSquare },
      { label: "Comprovantes IA", to: "/comprovantes-ia", icon: ReceiptText },
      { label: "Inteligência IA", to: "/inteligencia-ia", icon: Brain },
      { label: "Meta Ads", to: "/meta-ads", icon: Megaphone },
      { label: "Tarefas", to: "/tarefas", icon: CheckSquare },
    ],
  },
  {
    title: "Dados",
    items: [
      { label: "Transações", to: "/transacoes", icon: ArrowLeftRight },
      { label: "Leads", to: "/leads", icon: Users },
      { label: "Tags", to: "/tags", icon: Tag },
      { label: "Público", to: "/publico", icon: UserSquare2 },
      { label: "Financeiro", to: "/financeiro", icon: Wallet },
    ],
  },
  {
    title: "Configurações",
    items: [
      { label: "Operações", to: "/operacoes", icon: Building2 },
    ],
  },
];

const ADMIN_SECTION: NavSection = {
  title: "Admin",
  items: [{ label: "Usuários", to: "/usuarios", icon: ShieldCheck }],
};

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, signOut } = useAuth();
  const visibleSections = profile?.role === "admin" ? [...sections, ADMIN_SECTION] : sections;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shadow-[0_0_24px_-4px_oklch(0.705_0.18_45/0.6)]">
          <span className="text-base font-bold text-primary-foreground">C</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide text-foreground">Innova CRM</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            v1.0
          </span>
        </div>
      </div>

      <OperationSelector />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={[
                        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-foreground",
                      ].join(" ")}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                      <span className="font-medium">{item.label}</span>
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {(profile?.full_name ?? profile?.email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-medium text-foreground">
              {profile?.full_name ?? profile?.email ?? "Usuário"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {profile?.role === "admin" ? "Admin" : "Operador"}
            </span>
          </div>
          <button
            onClick={signOut}
            title="Sair"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function OperationSelector() {
  const { operations, currentOperation, setCurrentOperation, isLoading } = useOperation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative border-b border-sidebar-border px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isLoading || operations.length === 0}
        className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-3 py-2 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
      >
        <Building2 className="h-4 w-4 text-primary" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Operação
          </span>
          <span className="truncate text-xs font-medium text-foreground">
            {isLoading ? "Carregando…" : currentOperation?.name ?? "Nenhuma"}
          </span>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && operations.length > 0 && (
        <div className="absolute left-3 right-3 top-full z-40 mt-1 overflow-hidden rounded-md border border-sidebar-border bg-popover shadow-xl">
          <ul className="max-h-64 overflow-y-auto py-1">
            {operations.map((op) => {
              const active = op.id === currentOperation?.id;
              return (
                <li key={op.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentOperation(op);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-sidebar-accent/40 ${
                      active ? "text-primary" : "text-foreground"
                    }`}
                  >
                    <span className="flex-1 truncate font-medium">{op.name}</span>
                    {active && <Check className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

