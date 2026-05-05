import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Plus, Pencil, Power } from "lucide-react";

export const Route = createFileRoute("/produtos")({
  component: ProdutosPage,
});

const products = [
  {
    id: "p1",
    name: "Mentoria Premium",
    description: "Acesso completo ao programa de mentoria 1:1",
    prices: [97, 197, 297],
    pix_key: "contato@cland.com.br",
    recipient: "CLand Mentorias LTDA",
    active: true,
  },
  {
    id: "p2",
    name: "Curso Express",
    description: "Curso intensivo de 7 dias",
    prices: [47, 67],
    pix_key: "12345678000199",
    recipient: "CLand Mentorias LTDA",
    active: true,
  },
  {
    id: "p3",
    name: "Upsell VIP",
    description: "Acesso vitalício ao grupo VIP",
    prices: [497],
    pix_key: "vip@cland.com.br",
    recipient: "CLand Mentorias LTDA",
    active: false,
  },
];

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProdutosPage() {
  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle="Catálogo de produtos e chaves PIX"
        actions={
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Novo Produto
          </button>
        }
      />
      <div className="p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{p.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    p.active
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  <Power className="h-2.5 w-2.5" /> {p.active ? "Ativo" : "Inativo"}
                </span>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Preços
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.prices.map((v) => (
                    <span
                      key={v}
                      className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                    >
                      {fmt(v)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Chave PIX
                </p>
                <p className="font-mono text-xs text-foreground">{p.pix_key}</p>
                <p className="text-xs text-muted-foreground">{p.recipient}</p>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-3">
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
