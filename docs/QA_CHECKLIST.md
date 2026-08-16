# QA Checklist

- [x] Agenda proporcional com horario manual de inicio dos disparos.
- [x] Bloqueio de fila iniciada com uma hora ou menos de antecedencia.
- [x] Multiplos turnos por empresa.
- [x] Prioridade operacional no turno.
- [x] Normalizacao de resposta sim/nao.
- [x] Respostas validas cancelam lembretes pendentes.
- [x] Mensagem visual clara com `1 - Sim` e `2 - Não`.
- [x] Resposta incompreensivel ate 3 tentativas.
- [x] Alerta apos resposta incompreensivel expirada.
- [x] Sem duplicidade de mensagens operacionais.
- [x] Dashboard autenticado.
- [x] RLS habilitado na migration.
- [x] Service role ausente do frontend.
- [x] Bot nao versiona sessao WhatsApp.
- [x] Relatorios por dados do Dashboard.
- [x] Scan de secrets.
- [x] QA visual desktop e mobile sem overflow horizontal.
- [x] Scripts Supabase sem comandos destrutivos remotos.
- [x] Cron Supabase em migration, sem SQL solto.
- [x] Edge Functions alternativas removidas dos scripts de deploy.
- [x] Retencao de logs tecnicos e heartbeats antigos.

Verificacoes executadas em 2026-06-18:

- `node --test tests/*.test.mjs`: 18 testes passaram.
- `npm run test:visual`: 2 testes Playwright passaram em desktop e mobile.
- `node scripts/scan-secrets.mjs`: passou.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- `powershell -ExecutionPolicy Bypass -File scripts/supabase-check.ps1`: ambiente basico OK; login Supabase e link remoto pendentes.

Observacao: os testes locais validam estrutura, regras e render inicial. A validacao com dados reais ainda depende do Supabase novo configurado pelo usuario.

Verificacoes executadas em 2026-06-19:

- `node --test tests/core.test.mjs`: passou durante a implementacao das regras.
- `node --test tests/static-security.test.mjs`: passou durante a limpeza dos caminhos obsoletos.
- `npm run typecheck`: passou durante a limpeza do Dashboard.

# Ordenacao nominal

- [ ] Empresas aparecem em ordem alfabetica nos seletores e grupos.
- [ ] Colaboradores aparecem em ordem alfabetica nas equipes, cadastros e relatorios.
- [ ] Contatos de alerta aparecem em ordem alfabetica.
- [ ] Painel do Dia mantem todos os ainda pendentes em ordem alfabetica no topo e desloca respondidos para baixo.
- [ ] `Desmarcar todos` limpa somente a Equipe do dia e fica desabilitado quando a selecao esta vazia.
- [ ] Auditoria continua cronologica e horarios continuam temporais.
