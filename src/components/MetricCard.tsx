import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type Trend = "up" | "down" | "neutral";

type Props = {
  label: string;
  value: string;
  sub?: string;
  trend?: Trend;
  accent?: "default" | "success" | "destructive" | "primary";
  icon?: ReactNode;
};

const accentMap = {
  default: "text-foreground",
  success: "text-success",
  destructive: "text-destructive",
  primary: "text-primary",
} as const;

export function MetricCard({ label, value, sub, trend = "neutral", accent = "default", icon }: Props) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;
  const trendClass =
    trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={`mt-3 text-2xl font-bold tracking-tight ${accentMap[accent]}`}>{value}</p>
      {sub && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendClass}`}>
          {TrendIcon && <TrendIcon className="h-3.5 w-3.5" />}
          <span>{sub}</span>
        </div>
      )}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/5 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
    </div>
  );
}
