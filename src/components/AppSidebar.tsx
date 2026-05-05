import { Link, useRouterState } from "@tanstack/react-router";
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
      { label: "Produtos", to: "/produtos", icon: Package },
      { label: "Fluxos", to: "/fluxos", icon: Workflow },
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
      { label: "Público", to: "/publico", icon: UserSquare2 },
      { label: "Financeiro", to: "/financeiro", icon: Wallet },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shadow-[0_0_24px_-4px_oklch(0.705_0.18_45/0.6)]">
          <span className="text-base font-bold text-primary-foreground">C</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide text-foreground">CLand Dash</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            v1.0
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
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
            CL
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-medium text-foreground">Operador</span>
            <span className="text-[10px] text-muted-foreground">acesso único</span>
          </div>
          <span className="ml-auto h-2 w-2 rounded-full bg-success shadow-[0_0_8px_oklch(0.7_0.18_145/0.8)]" />
        </div>
      </div>
    </aside>
  );
}
