## Diagnóstico atual

Acabei de testar os dois domínios:

| Domínio | Status | Resultado |
|---|---|---|
| `project--4cb49bae…lovable.app/api/public/webhook-whatsapp` (produção) | **404** | "Publish or update your Lovable project for it to appear here." |
| `project--4cb49bae…-dev.lovable.app/api/public/webhook-whatsapp` (preview) | **200 ok** | Lead "Teste Plan" inserido com sucesso às 19:03:04 |

Ou seja: o domínio de **produção continua não publicado** (ou o publish não concluiu). O domínio de **preview** está 100% funcional — payload é aceito, lead criado, mensagem persistida.

## Plano

Você tem duas opções; ambas resolvem o problema. Recomendo a #1.

### Opção 1 — Publicar o projeto (recomendado)

1. Clicar em **Publish** no topo direito do editor.
2. Manter a URL atual do webhook na Evolution (`project--4cb49bae…lovable.app/...`) — ela passa a funcionar imediatamente após o primeiro publish.
3. Enviar uma mensagem real de outro número para o `DashWhats`.
4. Rodar `SELECT … FROM leads ORDER BY created_at DESC LIMIT 3` para confirmar.

Vantagem: a URL fica estável para sempre, mesmo que o preview seja regenerado.

### Opção 2 — Apontar o webhook da Evolution para o domínio de preview

Atualizar a configuração na Evolution via:
```
POST /webhook/set/DashWhats
{
  "url": "https://project--4cb49bae-afe3-4c97-ab68-38e668ee52f9-dev.lovable.app/api/public/webhook-whatsapp",
  "enabled": true,
  "webhookByEvents": false,
  "webhookBase64": true,
  "events": ["MESSAGES_UPSERT","CONNECTION_UPDATE","SEND_MESSAGE"]
}
```

Desvantagem: o domínio `-dev` reflete o último build de preview; se o preview for regenerado de forma estranha pode haver janela de instabilidade. Para webhook de produção, prefira publicar.

## Qual opção seguir?

Me confirma qual caminho você quer (ou se já clicou em Publish e quer que eu re-teste o domínio de produção). Quando você decidir, eu saio do modo de plano e executo.