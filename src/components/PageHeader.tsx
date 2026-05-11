import type { ReactNode } from "react";
import { useOperation } from "@/contexts/OperationContext";
import { Building2 } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, badge, actions }: Props) {
  const { currentOperation } = useOperation();

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-background/60 px-8 py-6 backdrop-blur">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold uppercase tracking-[0.14em] text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {currentOperation && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Building2 className="h-3.5 w-3.5" />
            {currentOperation.name}
          </span>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
