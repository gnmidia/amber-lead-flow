import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/hub")({
  component: HubLogin,
});

function HubLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Guard takes over from here based on profile.status
    navigate({ to: "/overview" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary text-lg font-bold">
            ◆
          </div>
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-border/60 bg-card p-6"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              E-mail
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Senha
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <div className="pt-2 text-center">
            <Link
              to="/registrar"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Solicitar acesso
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
