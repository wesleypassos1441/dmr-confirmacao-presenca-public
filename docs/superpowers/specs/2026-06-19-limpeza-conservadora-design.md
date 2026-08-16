# Limpeza conservadora de codigo e banco

## Objetivo

Reduzir caminhos duplicados, consultas desnecessarias, codigo morto e crescimento tecnico sem apagar dados operacionais ou administrativos. A limpeza deve facilitar manutencao e diminuir risco de bugs, sem reiniciar o projeto e sem alterar migrations ja aplicadas.

## Principios

- Remover somente itens com ausencia de uso comprovada por busca no codigo e pelo fluxo remoto.
- Substituir uma funcao antes de remover o caminho antigo.
- Executar toda alteracao de banco por uma nova migration.
- Preservar empresas, turnos ativos, colaboradores, vinculos, escalas, confirmacoes, respostas, alertas e auditoria administrativa.
- Nao remover tabelas ou colunas apenas porque possuem poucos registros.
- Tratar desempenho com base em consultas, processos duplicados e crescimento de dados, nao pela quantidade de objetos vazios no esquema.

## Dashboard

### Remover

Os seguintes componentes e manipuladores permanecem no arquivo principal, mas nao fazem parte da navegacao atual:

- componente `OperacaoManual`;
- componente `Vinculos`;
- componente `Escalas`;
- `vinculoSchema`;
- `escalaSchema`;
- `escalaColaboradorSchema`;
- `createVinculo`;
- `createEscala`;
- `addEscalaColaborador`;
- `deleteEscala`;
- `editVinculo`;
- `editEscala`;
- `ensureEscala`.

As consultas de `escalas` e `empresa_colaboradores` devem permanecer apenas quando forem necessarias para as telas atuais. O cadastro de colaboradores ainda usa `empresa_colaboradores` para localizar a empresa de cada pessoa, portanto a tabela e a consulta de vinculos continuam ativas.

A consulta de `escalas` pode ser removida do carregamento geral se nenhuma tela atual consumir `data.escalas`.

### Manter

- Empresas.
- Turnos com criacao da operacao manual.
- Colaboradores com vinculo automatico.
- Painel do Dia.
- Relatorios.
- Contatos de Alerta.
- Auditoria.
- Configuracoes realmente aplicadas.
- Modal de edicao e exclusao segura.

## Geracao da fila

O sistema possui dois caminhos para criar mensagens:

- `public.gerar_fila_confirmacoes()`, executada a cada minuto pelo `pg_cron`;
- Edge Function `gerar-fila-confirmacoes`, mantida como alternativa.

O fluxo oficial sera exclusivamente a funcao SQL e o cron. A Edge Function alternativa deve ser removida do repositorio, dos scripts de deploy e do projeto remoto depois que a nova migration estiver aplicada e validada.

A nova versao da funcao SQL incorporara:

- agenda proporcional aprovada;
- mensagens visuais aprovadas;
- alerta uma hora antes da entrada;
- idempotencia por `chave_unica`;
- verificacao de resposta antes de criar cada lembrete.

## Relatorios

O Dashboard ja gera os relatorios usados pelo usuario diretamente dos dados carregados. A Edge Function `admin-report-daily` nao possui chamada no Dashboard ou em outro cliente.

Ela deve ser:

- removida do repositorio;
- removida dos scripts de deploy;
- removida do projeto remoto;
- retirada da documentacao.

O relatorio atual do Dashboard permanece.

## Biblioteca central

Funcoes ligadas exclusivamente a agenda automatica antiga devem ser removidas depois que a agenda proporcional entrar:

- `calcularAgendaEnvio`;
- `escolherTemplate`, caso nao seja mais usada pelas novas mensagens;
- constantes de templates antigos;
- `intervaloPrioridadeMs`, se permanecer sem consumidor operacional.

A biblioteca deve manter:

- normalizacao conservadora de respostas;
- mensagens aprovadas;
- agenda proporcional;
- normalizacao de telefone;
- parser de lote;
- mascaramento;
- regras de cancelamento e alertas usadas pelos testes.

As declaracoes TypeScript e testes devem acompanhar a interface final.

## Banco de dados

### Remover na primeira migration de limpeza

`templates_mensagem`:

- possui apenas os tres registros iniciais;
- nao e consultada pelo Dashboard, bot, cron ou Edge Functions ativas;
- sera substituida pelas funcoes centrais de mensagem testadas.

A migration deve remover antes:

- policies da tabela;
- grants;
- indices dependentes, se existirem;
- entrada em rotinas genericas que habilitam RLS ou publicacao.

Depois podera executar `drop table public.templates_mensagem`.

`agenda_padrao`:

- representa a agenda automatica antiga;
- sera substituida pela agenda proporcional baseada no inicio manual e no horario de entrada.

A migration deve apagar somente a linha:

```sql
delete from public.configuracoes_sistema where chave = 'agenda_padrao';
```

### Descontinuar sem remover imediatamente

Os campos antigos de prioridade devem deixar de participar das consultas e regras:

- `empresas.prioridade_envio_padrao`;
- `escalas.prioridade_envio`;
- `escala_colaboradores.prioridade_envio`.

A prioridade operacional passa a vir de `turnos_empresa.prioridade_envio`.

Essas colunas nao serao removidas na primeira migration. Uma migration posterior podera elimina-las somente depois de:

- deploy do novo codigo;
- validacao do cron;
- validacao dos envios;
- verificacao de que nenhuma funcao remota ou consulta ainda as referencia.

## Retencao de dados tecnicos

### Heartbeats

`bot_heartbeats` cresce continuamente e nao representa historico administrativo. O sistema deve manter os ultimos 30 dias.

Uma funcao SQL de manutencao removera registros com `criado_em` anterior a 30 dias.

### Logs

`logs_acoes` mistura auditoria administrativa e eventos tecnicos repetitivos.

Devem ser preservados sem prazo:

- criacao, edicao, inativacao e exclusao de cadastros;
- acoes de usuarios do Dashboard;
- tratamento manual;
- mudancas de configuracao.

Podem ser removidos depois de 90 dias:

- `gerar_fila_confirmacoes_sql`;
- heartbeats ou eventos tecnicos equivalentes;
- erros tecnicos repetitivos do bot que nao estejam associados a uma acao administrativa.

A limpeza deve filtrar explicitamente as acoes tecnicas permitidas. Nao sera usado um `delete` generico por data.

### Agendamento

A manutencao deve ser executada diariamente pelo `pg_cron`, em horario separado da geracao da fila. A funcao deve ser idempotente.

## Scripts e arquivos locais

### Remover

- logs locais de validacao em `logs/`;
- saidas antigas em `test-results/` quando nao forem necessarias;
- mensagens de scripts que descrevem caminhos substituidos;
- referencias de deploy das Edge Functions removidas.

### Manter

- scripts de login, link, secrets, migrations e deploy;
- script de reset da sessao do WhatsApp;
- orientacoes de erro que ainda correspondam ao fluxo atual;
- comentarios que expliquem seguranca, lock de processo ou recuperacao do navegador.

O arquivo de lock do bot e arquivos gerados devem permanecer ignorados por Git e nao ser tratados como codigo-fonte.

## Documentacao

Atualizar:

- `ARCHITECTURE.md`;
- `DATABASE_SCHEMA.md`;
- `EDGE_FUNCTIONS.md`;
- `WHATSAPP_BOT.md`;
- `QA_CHECKLIST.md`;
- `CHANGELOG.md`.

Remover descricoes das telas e Edge Functions excluidas. Registrar a funcao SQL como unico gerador de fila.

## Ordem de implementacao

1. Implementar e testar as novas mensagens, respostas e agenda proporcional.
2. Criar nova migration que substitui `gerar_fila_confirmacoes()`.
3. Aplicar migration e validar o cron e envios.
4. Remover codigo morto do Dashboard e consultas sem consumidor.
5. Remover Edge Functions alternativas e atualizar scripts.
6. Remover `templates_mensagem` e `agenda_padrao`.
7. Criar retencao de heartbeats e logs tecnicos.
8. Atualizar documentacao.
9. Executar testes, typecheck, build, scan de secrets e validacao remota.
10. Somente depois considerar a migration que remove colunas antigas de prioridade.

## Verificacao

A limpeza sera aceita quando:

- nao houver referencias aos componentes e manipuladores mortos;
- o Dashboard continuar criando empresas, turnos, colaboradores, filas e contatos;
- o cron continuar gerando as tres tentativas sem duplicidade;
- respostas validas continuarem cancelando lembretes;
- relatorios continuarem funcionando sem `admin-report-daily`;
- os scripts nao tentarem fazer deploy de funcoes removidas;
- `templates_mensagem` e `agenda_padrao` nao existirem mais;
- somente logs tecnicos elegiveis forem removidos pela retencao;
- testes, typecheck, build e scan de secrets passarem;
- o banco remoto confirmar o fluxo operacional antes da remocao posterior de colunas.
