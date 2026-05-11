import { useEffect, ReactNode } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

const PUBLIC_ROUTES = new Set(["/", "/hub", "/registrar"]);
const STATUS_ROUTES = new Set(["/aguardando", "/bloqueado"]);

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    const isPublic = PUBLIC_ROUTES.has(pathname);
    const isStatusRoute = STATUS_ROUTES.has(pathname);

    // Not logged in
    if (!session) {
      if (!isPublic) navigate({ to: "/hub" });
      return;
    }

    // Logged in but profile not loaded yet — wait
    if (!profile) return;

    // Status routing
    if (profile.status === "blocked") {
      if (pathname !== "/bloqueado") navigate({ to: "/bloqueado" });
      return;
    }
    if (profile.status === "pending") {
      if (pathname !== "/aguardando") navigate({ to: "/aguardando" });
      return;
    }

    // Approved: don't let them sit on auth/status pages
    if (pathname === "/hub" || pathname === "/registrar" || pathname === "/" || isStatusRoute) {
      navigate({ to: "/overview" });
    }
  }, [session, profile, loading, pathname, navigate]);

  return <>{children}</>;
}
