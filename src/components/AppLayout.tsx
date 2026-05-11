import { Outlet, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "./AppSidebar";

const NO_CHROME_ROUTES = new Set([
  "/",
  "/hub",
  "/registrar",
  "/aguardando",
  "/bloqueado",
]);

export function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const noChrome = NO_CHROME_ROUTES.has(pathname);

  if (noChrome) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <main className="ml-64 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
