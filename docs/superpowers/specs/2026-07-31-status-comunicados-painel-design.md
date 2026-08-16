# Status de comunicados no Painel do Dia

## Objetivo

Mostrar no quadro da empresa e jornada que um comunicado foi criado e acompanhar seu envio real aos destinatarios. O fluxo atual de criacao, agendamento e disparo permanece inalterado.

## Contexto

O dashboard cria um registro em `comunicados_operacionais`, um registro por destinatario em `comunicado_destinatarios` e uma mensagem do tipo `comunicado_manual` em `fila_mensagens`. A fila ja registra estados como pendente, processando, enviada, erro e cancelada, mas o Painel do Dia nao consulta nem apresenta essas informacoes.

Essa ausencia faz um comunicado agendado ou ainda em processamento parecer que nao foi criado ou enviado.

## Experiencia aprovada

Cada quadro de empresa e jornada no Painel do Dia tera uma secao compacta chamada `Recados`, posicionada junto aos controles do quadro e antes da tabela de colaboradores.

Cada comunicado da operacao e da data exibira:

- assunto;
- horario de criacao;
- total de destinatarios;
- progresso calculado a partir das mensagens reais da fila;
- horario da conclusao quando todos os envios forem finalizados com sucesso.

Exemplo concluido:

> Aviso operacional  
> Criado as 11:23 · Enviado para 4/4 colaboradores as 11:29

Durante o processamento:

> Aviso operacional  
> Criado as 11:23 · Enviando 2/4

Se houver falha:

> Aviso operacional  
> Criado as 11:23 · Falha em 1 envio · Enviado para 3/4

O indicador usara texto e cor, nunca apenas cor, para permanecer compreensivel e acessivel.

## Estados e regras de apresentacao

O estado visual sera derivado dos registros de `fila_mensagens` vinculados por `comunicado_destinatarios.fila_mensagem_id`:

- `Criado`: comunicado existente, mas ainda sem mensagem concluida;
- `Agendado`: todas as mensagens estao pendentes e `agendado_para` ainda esta no futuro;
- `Enviando X/Y`: existe mensagem pendente ou processando e ao menos uma mensagem ja foi enviada;
- `Enviado para Y/Y`: todas as mensagens estao com status `enviada`;
- `Falha em X envios`: existe mensagem com status de erro; o mesmo resumo informa quantas foram enviadas;
- `Cancelado`: todas as mensagens foram canceladas;
- `Parcial`: combinacao final de enviadas, erros ou canceladas sem mensagens pendentes.

O horario de conclusao sera o maior `enviada_em` entre os destinatarios quando todos estiverem enviados. O horario de criacao vira de `comunicados_operacionais.criado_em`.

## Arquitetura e fluxo de dados

O carregamento do Painel do Dia consultara os comunicados vinculados as jornadas exibidas e seus destinatarios com a respectiva mensagem da fila. A transformacao desses registros em um resumo visual ficara em uma funcao pura e testavel, separada do componente da pagina.

O componente do quadro recebera os resumos ja agrupados por `empresa_horario_id`. Assim, a camada visual apenas renderiza assunto, horarios, contagens e estado, sem duplicar regras da fila.

Nenhuma RPC de criacao ou envio sera alterada. O bot e o processamento da fila continuam sendo a fonte de verdade para determinar se o recado foi realmente enviado.

Depois de criar um comunicado, o dashboard recarregara os dados da operacao para mostrar imediatamente o estado `Criado` ou `Agendado`. As atualizacoes manuais pelo botao `Atualizar dados` refletirao o progresso e a conclusao.

## Tratamento de erros

- Falha ao carregar os comunicados nao apaga nem altera a operacao principal do painel.
- A secao `Recados` mostra uma mensagem curta de indisponibilidade e permite que o restante do quadro continue utilizavel.
- Mensagens de fila sem vinculo valido nao serao contadas como enviadas.
- Um comunicado sem destinatarios vinculados aparece como inconsistencia, sem afirmar que foi enviado.

## Escopo

Incluido:

- exibir comunicados no quadro correto da empresa e jornada;
- mostrar criacao, progresso, falhas e conclusao do envio;
- atualizar a secao apos criar um comunicado e ao atualizar o painel;
- testes da agregacao de estados e da renderizacao visual.

Nao incluido:

- mudar o horario padrao ou o comportamento do envio;
- reenviar, cancelar, editar ou apagar comunicados;
- criar uma nova pagina de historico;
- misturar o status do comunicado com o status de confirmacao de presenca.

## Testes e criterios de aceite

1. Ao criar um comunicado para quatro colaboradores, o quadro mostra o assunto, `Criado` e `0/4` ou `Agendado para HH:MM` conforme o horario escolhido.
2. Quando duas mensagens forem enviadas, o quadro mostra `Enviando 2/4`.
3. Quando as quatro mensagens forem enviadas, o quadro mostra `Enviado para 4/4 colaboradores` e o horario da ultima entrega.
4. Se uma mensagem falhar, o quadro mostra a quantidade de falhas e de envios concluidos.
5. Comunicados aparecem somente no quadro da empresa e jornada aos quais pertencem.
6. Criar ou acompanhar um comunicado nao altera `status_confirmacao`, respostas, lembretes ou alertas dos colaboradores.
7. O painel continua funcional se a consulta de comunicados falhar.
8. O indicador permanece compreensivel sem depender exclusivamente de cores.

