# Decisoes

## 2026-06-18

- O projeto antigo `files-mentioned-by-the-user-cadastro` nao sera usado nem alterado para este sistema, porque o usuario informou que usara outro banco de dados.
- Criado projeto novo em `dmr-confirmacao-presenca`.
- As Skills solicitadas no prompt original nao estao todas disponiveis neste ambiente:
  - `$project-context-keeper`: indisponivel; procedimento equivalente feito com docs obrigatorios e leitura de contexto.
  - `$project-focus-review`: indisponivel; procedimento equivalente feito com checklist e plano incremental.
  - `$premium-ui-ux`: indisponivel; equivalente usado: `ui-ux-pro-max`.
  - `$human-copywriter`: indisponivel; textos da interface serao revisados manualmente para clareza leiga.
  - `$security-reviewer`: indisponivel; equivalente manual com checklist de seguranca, RLS, scan de secrets e revisao de Edge Functions.
  - `$playwright-visual-qa`: indisponivel como skill nomeada; Playwright sera usado diretamente quando dependencias estiverem instaladas.
- A especificacao anexada foi tratada como aprovada pelo usuario, pois ela pede explicitamente para implementar automaticamente.
- `whatsapp-web.js` foi mantido por requisito. Risco conhecido: depende do WhatsApp Web e pode quebrar se a interface mudar. Mitigacao: bot local, sem service role, com logs seguros e handoff simples.
- `next` foi fixado em `16.3.0-canary.8` temporariamente porque `next@16.2.9` trazia `postcss@8.4.31`, afetado pelo advisory moderado GHSA-qx2v-qp2m-jg93. Com a canary e override de `postcss@8.5.10`, `npm audit --audit-level=moderate` ficou sem vulnerabilidades.
- `npm outdated` ainda lista majors opcionais (`@types/node`, `dotenv`, `eslint`) e mostra Next canary acima do `latest` estavel. Eles nao foram atualizados automaticamente para evitar troca de major desnecessaria ou perda da correcao de seguranca do Next.
- `node_modules` foi instalado no projeto novo para permitir build/typecheck/audit locais. A pasta esta ignorada por `.gitignore`.
- O comando local do Dashboard usa `next dev --webpack`. No Windows, o servidor dev com Turbopack da canary retornou 403 para alguns chunks durante QA visual; o build de producao continua passando com Turbopack.
- O Playwright usa o Chrome instalado em `C:\Program Files\Google\Chrome\Application\chrome.exe` quando os browsers gerenciados do Playwright nao estiverem baixados.
- O estado inicial do Dashboard nao fica bloqueado em `Carregando...`; a tela renderiza imediatamente e atualiza a sessao em segundo plano.
- A Supabase CLI foi instalada como dependência local de desenvolvimento (`supabase` em `devDependencies`) e deve ser chamada com `npx supabase`.
- O cron antigo em SQL solto foi removido; o cron oficial agora fica em migration com `pg_cron` chamando `public.gerar_fila_confirmacoes()`.
- O deploy remoto nao foi executado porque o Supabase CLI respondeu `Unauthorized` e o projeto ainda nao esta linkado. Isso exige login/token e Project Ref do usuario.
- O teste local com Docker foi tentado, mas o Docker Desktop retornou `meta.db: read-only file system` ao puxar imagens. Nenhuma alteracao remota foi feita.
- `npx supabase functions list` tambem foi tentado e falhou por memoria no runtime da CLI neste ambiente; o script de deploy permanece pronto para rodar apos login/link e com o ambiente normalizado.
- `npm outdated` foi tentado, mas falhou por `ENOSPC`; nao houve atualizacao adicional de dependencias nesta etapa.
