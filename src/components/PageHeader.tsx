import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, badge, actions }: Props) {
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
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
