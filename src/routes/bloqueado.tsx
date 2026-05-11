import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/bloqueado")({
  component: BlockedPage,
});

function BlockedPage() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl">
          ✕
        </div>
        <h1 className="text-2xl font-semibold">Acesso negado</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sua conta foi bloqueada. Entre em contato com o administrador para mais informações.
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
