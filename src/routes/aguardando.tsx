import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/aguardando")({
  component: WaitingPage,
});

function WaitingPage() {
  const { signOut, profile } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
          ⏳
        </div>
        <h1 className="text-2xl font-semibold">Acesso em análise</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sua solicitação foi recebida{profile?.email ? ` (${profile.email})` : ""}. Um administrador
          irá revisar e liberar seu acesso em breve.
        </p>
        <button
          onClick={signOut}
          className="mt-8 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
