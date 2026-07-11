import { lazy, Suspense, useEffect, useState } from "react";

// O React Flow toca em window/document na montagem. Como o app roda com SSR
// (TanStack Start), o builder NUNCA pode renderizar no servidor: este wrapper
// só monta o componente real depois do primeiro render no cliente, e o
// lazy() garante que o bundle do @xyflow/react nem é carregado no server.
const FunnelBuilderInner = lazy(() =>
  import("./FunnelBuilder").then((m) => ({ default: m.FunnelBuilder })),
);

export function ClientOnlyBuilder(props: { funnelId: string; operationId: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <CanvasFallback />;
  return (
    <Suspense fallback={<CanvasFallback />}>
      <FunnelBuilderInner {...props} />
    </Suspense>
  );
}

function CanvasFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background/40">
      <p className="text-sm text-muted-foreground">Carregando canvas…</p>
    </div>
  );
}
