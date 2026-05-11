## Adaptar projeto para Node.js (VPS / EasyPanel)

**Aviso crítico:** Estas mudanças vão quebrar o preview do Lovable. O wrapper `@lovable.dev/vite-tanstack-config` injeta automaticamente o plugin Cloudflare e é o que faz o preview/sandbox do Lovable funcionar. Ao substituir o `vite.config.ts` por um config Node-target puro, o ambiente Lovable deixa de buildar. Você confirmou que aceita.

### Arquivos a alterar/criar

1. **`vite.config.ts`** — substituir por config com `tanstackStart({ target: "node-server" })`, `viteReact`, `tailwindcss`, `tsConfigPaths`. Remove a dependência do wrapper Lovable + plugin Cloudflare.

2. **`package.json`** — adicionar:
   - `"start": "node .output/server/index.mjs"`
   - remover deps: `@cloudflare/vite-plugin`, `@lovable.dev/vite-tanstack-config` (este injeta o Cloudflare plugin; precisa sair também). `wrangler` não está nas deps hoje, então nada a remover dele.

3. **`Dockerfile`** (raiz) — multi-stage Node 20 alpine, build → runtime, expõe `3000`, `CMD ["node", ".output/server/index.mjs"]`.

4. **`.dockerignore`** (raiz) — ignora `node_modules`, `.git`, `dist`, `.output`, `*.log`, `.env*`.

5. **`wrangler.jsonc`** — deletar (config exclusiva de Cloudflare Workers, sem uso em Node).

### Sobre o output path

O preset `node-server` do TanStack Start v1 emite o servidor em `.output/server/index.mjs` por padrão (Nitro). O `CMD` do Dockerfile e o `start` script já apontam pra lá. Como estou em plan mode não posso rodar `npm run build` para confirmar — se na primeira execução o caminho diferir (ex.: `.output/server/index.js`), basta ajustar o CMD.

### Variáveis de ambiente em produção (configurar no EasyPanel)

Runtime (server):
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`
- `LOVABLE_API_KEY` (se mantiver uso do Lovable AI Gateway)
- `PORT=3000`, `NODE_ENV=production`

Build-time (precisam estar disponíveis durante `npm run build` no Docker):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

→ No EasyPanel, passe os `VITE_*` como build args (ou fixe via `.env` copiado no estágio de build). Hoje seu `.env` aponta pro Supabase do Lovable Cloud (`uzuxxgvpgsqmkolmmqcv`). Para o DashWhats você precisará trocar essas URLs/keys no ambiente da VPS.

### Pós-deploy — passos manuais (fora do escopo desta etapa)

- Apontar para o Supabase DashWhats via env vars no EasyPanel.
- Rodar `schema.sql` + `data.sql` no DashWhats (já gerados).
- Recriar usuário admin no DashWhats e atualizar `user_profiles`.
- Configurar domínio + Traefik no EasyPanel apontando para porta 3000 do container.

### Resumo da entrega

Após aprovação, vou:
1. Reescrever `vite.config.ts`.
2. Atualizar `package.json` (script `start` + remover deps Cloudflare/Lovable wrapper).
3. Criar `Dockerfile` e `.dockerignore` na raiz.
4. Deletar `wrangler.jsonc`.
5. Listar todos os arquivos alterados ao final.
