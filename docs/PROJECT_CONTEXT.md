# DMR Confirmacao de Presenca - Contexto

Projeto novo e isolado criado em `dmr-confirmacao-presenca`, sem reutilizar o banco, migrations ou codigo do projeto `files-mentioned-by-the-user-cadastro`.

O sistema atende somente confirmacao operacional de presenca de colaboradores por empresa. Nao e marketing, nao e disparo generico em massa e nao possui auto-remocao pelo colaborador.

Stack escolhida para projeto novo:

- Next.js com TypeScript para o Dashboard.
- Supabase para banco, Auth, RLS, Edge Functions, Cron e Realtime.
- Node.js com TypeScript para o bot local de WhatsApp.
- `whatsapp-web.js` com `LocalAuth` para sessao local.
- Validacao por `zod` nas bordas de API e formularios.
- Testes com `node:test` para regras centrais e Playwright para fluxos visuais essenciais.

