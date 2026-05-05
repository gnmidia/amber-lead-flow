import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { Construction } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  description?: string;
  children?: ReactNode;
};

export function ModulePlaceholder({ title, subtitle, description, children }: Props) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="p-8">
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Módulo em construção</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {description ??
              "A interface deste módulo será implementada em uma próxima iteração. A navegação e o design system já estão prontos."}
          </p>
          {children}
        </div>
      </div>
    </>
  );
}
