# Plano de implementacao: empresas e colaboradores

> Execucao sequencial no mesmo agente, sem subagentes, conforme solicitado pelo usuario.

## 1. Fixar o comportamento com testes

Arquivos:
- `tests/company-collaborator-lifecycle.test.mjs`
- `tests/dashboard-operational-upgrade.test.mjs`

Cobrir migracao, RPCs, ausencia de exclusao fisica, busca, historico, navegacao e propagacao dos horarios padrao. Executar os testes novos antes da implementacao e confirmar que falham pelas razoes esperadas.

## 2. Migracao e funcoes transacionais

Arquivo:
- `supabase/migrations/20260729000200_company_collaborator_lifecycle.sql`

Adicionar campos de encerramento, tabela de movimentacoes, backfill idempotente, RLS, indices e RPCs. Substituir a RPC de realocacao sem mudar sua assinatura publica e registrar eventos de origem/destino.

## 3. Tipos e utilitarios do dashboard

Arquivos:
- `apps/dashboard/src/lib/collaborators.ts`
- `apps/dashboard/src/lib/schedule-editor.ts`
- `apps/dashboard/src/types/domain.ts`

Criar busca normalizada, agrupamento de equipes, rotulos de historico e propagacao pura de horarios semanais.

## 4. Reorganizar as telas

Arquivos:
- `apps/dashboard/app/page.tsx`
- `apps/dashboard/src/components/CollaboratorHistoryDialog.tsx`
- `apps/dashboard/src/components/TeamRemovalDialog.tsx`
- `apps/dashboard/src/components/CompanyLifecycleDialog.tsx`

Adicionar Banco de colaboradores, renomear a tela operacional para Equipes por empresa, trocar prompts por modais e integrar as RPCs. Exibir estados da empresa e manter empresas historicas fora dos seletores de criacao.

## 5. Propagar entrada e saida padrao

Arquivo:
- `apps/dashboard/src/components/ScheduleEditor.tsx`

Usar o utilitario testado para atualizar todos os dias ao mudar o padrao, sem bloquear edicoes individuais posteriores.

## 6. Verificacao completa

Executar:
- testes focados;
- `npm test`;
- `npm run typecheck`;
- `npm run secrets:scan`;
- build do dashboard;
- verificacao visual desktop e mobile dos fluxos alterados.

Revisar o diff, migracoes e mensagens de erro antes de integrar.

## 7. Integracao e publicacao

- Criar commit de backup antes da integracao.
- Aplicar a migracao remota somente apos login/link/senha validos.
- Mesclar a branch no repositorio principal sem incluir alteracoes locais nao relacionadas do bot.
- Publicar o dashboard no Netlify e validar o dominio de producao.

