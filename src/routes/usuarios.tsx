import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/usuarios")({
  component: UsersPage,
});

function UsersPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setUsers((data as UserProfile[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const isAdmin = me?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="p-10">
        <h1 className="text-xl font-semibold">Sem permissão</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Apenas administradores podem acessar esta página.
        </p>
      </div>
    );
  }

  const updateUser = async (id: string, patch: Partial<UserProfile>) => {
    const { error } = await supabase.from("user_profiles").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Atualizado");
    load();
  };

  const approve = (u: UserProfile) =>
    updateUser(u.id, {
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: me?.id ?? null,
    });

  const block = (u: UserProfile) => updateUser(u.id, { status: "blocked" });
  const promote = (u: UserProfile) =>
    updateUser(u.id, { role: u.role === "admin" ? "operator" : "admin" });

  const statusBadge = (s: UserProfile["status"]) => {
    const map: Record<UserProfile["status"], string> = {
      pending: "bg-yellow-500/10 text-yellow-500",
      approved: "bg-green-500/10 text-green-500",
      blocked: "bg-red-500/10 text-red-500",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[s]}`}>
        {s === "pending" ? "Pendente" : s === "approved" ? "Aprovado" : "Bloqueado"}
      </span>
    );
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie acesso, aprovações e permissões.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">E-mail</th>
              <th className="px-4 py-3 text-left">Papel</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Cadastro</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border/40">
                <td className="px-4 py-3">{u.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {u.role === "admin" ? "Admin" : "Operador"}
                  </span>
                </td>
                <td className="px-4 py-3">{statusBadge(u.status)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {u.status !== "approved" && (
                      <button
                        onClick={() => approve(u)}
                        className="rounded-md bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-500 hover:bg-green-500/20"
                      >
                        Aprovar
                      </button>
                    )}
                    {u.status !== "blocked" && u.id !== me?.id && (
                      <button
                        onClick={() => block(u)}
                        className="rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/20"
                      >
                        Bloquear
                      </button>
                    )}
                    {u.id !== me?.id && (
                      <button
                        onClick={() => promote(u)}
                        className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        {u.role === "admin" ? "Rebaixar" : "Promover a Admin"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
