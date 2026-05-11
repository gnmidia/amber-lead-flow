import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Innova CRM — Automação de Vendas WhatsApp" },
      { name: "description", content: "Plataforma completa de automação de vendas via WhatsApp com IA, funis e Meta Ads." },
      { property: "og:title", content: "Innova CRM — Automação de Vendas WhatsApp" },
      { name: "twitter:title", content: "Innova CRM — Automação de Vendas WhatsApp" },
      { property: "og:description", content: "Plataforma completa de automação de vendas via WhatsApp com IA, funis e Meta Ads." },
      { name: "twitter:description", content: "Plataforma completa de automação de vendas via WhatsApp com IA, funis e Meta Ads." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/40a24192-235f-444b-8d33-1ad64f472191/id-preview-5db6a17b--4cb49bae-afe3-4c97-ab68-38e668ee52f9.lovable.app-1778094946507.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/40a24192-235f-444b-8d33-1ad64f472191/id-preview-5db6a17b--4cb49bae-afe3-4c97-ab68-38e668ee52f9.lovable.app-1778094946507.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { AppLayout } from "../components/AppLayout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import { OperationProvider } from "../contexts/OperationContext";
import { AuthProvider } from "../contexts/AuthContext";
import { AuthGuard } from "../lib/auth-guard";

function RootComponent() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthGuard>
          <AppLayout />
          <Toaster theme="dark" position="top-right" richColors />
        </AuthGuard>
      </AuthProvider>
    </QueryClientProvider>
  );
}
