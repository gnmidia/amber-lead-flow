import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: PublicLanding,
});

function PublicLanding() {
  const navigate = useNavigate();
  const [clicks, setClicks] = useState(0);

  const handleLogoClick = () => {
    const next = clicks + 1;
    setClicks(next);
    if (next >= 3) {
      setClicks(0);
      navigate({ to: "/hub" });
    }
    setTimeout(() => setClicks(0), 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <button
            type="button"
            onClick={handleLogoClick}
            className="flex items-center gap-3 select-none focus:outline-none"
            aria-label="logo"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary font-bold">
              S
            </div>
            <span className="text-sm font-semibold tracking-wide">Soluções Digitais</span>
          </button>
          <nav className="hidden gap-8 text-sm text-muted-foreground sm:flex">
            <a href="#sobre" className="hover:text-foreground transition-colors">Sobre</a>
            <a href="#servicos" className="hover:text-foreground transition-colors">Serviços</a>
            <a href="#contato" className="hover:text-foreground transition-colors">Contato</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Plataforma corporativa
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Tecnologia sob medida para empresas que crescem com previsibilidade.
            </h1>
            <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Desenvolvemos soluções digitais para automação de processos, integração de sistemas
              e gestão de operações. Atendemos clientes corporativos sob NDA.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="#contato"
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Falar com a equipe
              </a>
              <a
                href="#servicos"
                className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Conhecer serviços
              </a>
            </div>
          </div>
        </section>

        <section id="servicos" className="border-t border-border/50 bg-muted/20">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">O que entregamos</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { t: "Automação", d: "Processos internos e fluxos comerciais com integração nativa às suas ferramentas." },
                { t: "Dados", d: "Painéis de acompanhamento, relatórios sob demanda e governança de informação." },
                { t: "Integrações", d: "APIs, webhooks e middleware para conectar sistemas legados a aplicações modernas." },
              ].map((s) => (
                <div key={s.t} className="rounded-lg border border-border/60 bg-card p-6">
                  <h3 className="text-lg font-semibold">{s.t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="sobre" className="border-t border-border/50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-10 sm:grid-cols-2">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Quem somos</h2>
                <p className="mt-4 text-sm text-muted-foreground">
                  Equipe enxuta de engenheiros e analistas focada em projetos de médio e longo prazo.
                  Atuação remota, com sede administrativa em São Paulo.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Atendimento</p>
                <p className="mt-2 text-sm">Segunda a sexta, 9h às 18h (BRT)</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Modelo</p>
                <p className="mt-2 text-sm">Projetos sob contrato — não atendemos demanda avulsa.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="contato" className="border-t border-border/50 bg-muted/20">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Vamos conversar?</h2>
            <p className="mt-4 text-sm text-muted-foreground">
              Envie um e-mail para <span className="text-foreground">contato@solucoes.example</span> com um resumo do projeto.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Soluções Digitais.</span>
          <span>Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
