# Equipe Fixa, Reenvio e Agenda de Disparos

## Objetivo

Simplificar a preparação diária das filas, permitir reenvio imediato e previsível para colaboradores sem resposta e substituir o cálculo proporcional dos lembretes por horários de relógio terminados em `:00` ou `:30`.

## Escopo

Esta mudança cobre:

- equipe fixa vinculada a uma empresa e a uma jornada específica;
- revisão da equipe antes da criação da fila diária;
- criação da fila somente após confirmação dessa revisão;
- botão de reenvio imediato no Painel do Dia;
- novos horários automáticos para os três envios;
- alerta de ausência de resposta 1h30 antes da entrada;
- proteção contra duplicidade, concorrência e reenvio de casos encerrados;
- auditoria das novas ações.

Não faz parte desta mudança:

- rotação entre números remetentes;
- alteração do reconhecimento de respostas `Sim` e `Não`;
- mudança no conteúdo visual das mensagens;
- exclusão automática de colaboradores da equipe permanente ao removê-los de um dia.

## Modelo operacional

### Equipe permanente

`empresa_colaboradores` continuará representando a equipe permanente. O vínculo é específico por:

- empresa;
- jornada em `empresa_horarios`;
- colaborador.

Assim, uma pessoa pode pertencer à jornada `08:00 as 18:00` sem ser automaticamente incluída na jornada `12:00 as 22:00` da mesma empresa.

Na tela Colaboradores, o usuário poderá:

- selecionar uma empresa;
- selecionar uma jornada;
- adicionar um colaborador individualmente ou em lote;
- excluir o vínculo daquela jornada;
- manter o cadastro global do colaborador quando ele ainda estiver ligado a outra equipe.

### Equipe diária

Na tela Turnos, depois de escolher empresa, Entrada/Saída, prioridade e horário de disparo, o usuário deverá clicar em **Carregar equipe fixa**.

O sistema exibirá uma lista de revisão contendo os colaboradores permanentes daquela jornada. Nessa revisão será possível:

- desmarcar alguém apenas para a operação daquele dia;
- adicionar um colaborador já cadastrado apenas para aquele dia;
- confirmar a seleção e clicar em **Adicionar fila**.

As alterações realizadas nessa revisão não modificam `empresa_colaboradores`. Elas afetam somente os registros diários criados em `escala_colaboradores`.

Se não houver ninguém selecionado, a fila não será criada e o dashboard exibirá uma mensagem clara.

## Agenda dos envios

Cada colaborador poderá receber no máximo três mensagens automáticas:

1. O primeiro envio ocorre no horário manual informado pelo usuário.
2. O segundo envio ocorre no próximo horário de relógio terminado em `:00` ou `:30`, estritamente posterior ao primeiro.
3. O terceiro envio ocorre no próximo horário de relógio terminado em `:00` ou `:30`, posterior ao segundo.

Exemplo:

- entrada: `16:00`;
- horário manual: `13:48`;
- primeiro envio: `13:48`;
- segundo envio: `14:00`;
- terceiro envio: `14:30`;
- alerta DMR: `14:35`.

Outro exemplo:

- entrada: `16:00`;
- horário manual: `13:00`;
- primeiro envio: `13:00`;
- segundo envio: `13:30`;
- terceiro envio: `14:00`;
- alerta DMR: `14:30`.

Se o horário manual já terminar em `:00` ou `:30`, ele continua sendo o primeiro envio e os seguintes avançam 30 minutos.

As regras também devem funcionar quando o disparo começa no dia anterior à entrada, como entrada `00:00` e disparo `22:45`.

### Respostas e cancelamento

Após uma resposta válida:

- `Sim` encerra os envios e define o status como confirmado;
- `Não` encerra os envios, define o status como não comparecerá e mantém o alerta imediato já existente;
- mensagens automáticas pendentes do colaborador são canceladas;
- reenvios manuais pendentes também são cancelados.

Resposta incompreensível não encerra o fluxo automático.

## Alerta sem resposta

O horário-base do alerta será 1h30 antes da entrada.

Se o terceiro envio estiver agendado exatamente no horário-base do alerta, o alerta será deslocado para cinco minutos depois do terceiro envio. Isso dá uma pequena janela para o colaborador responder.

Portanto:

- terceiro envio antes de 1h30: alerta exatamente 1h30 antes;
- terceiro envio exatamente em 1h30: alerta cinco minutos depois;
- o alerta só é criado quando não há resposta válida;
- o alerta mantém os contatos cadastrados em Contatos de Alerta;
- a unicidade atual continua impedindo múltiplos alertas iguais para o mesmo colaborador e contato.

O sistema deve impedir a criação de uma agenda em que o terceiro envio aconteça depois do alerta calculado. A mensagem de validação explicará que o horário manual está tarde demais para realizar os três envios.

## Reenvio imediato

O Painel do Dia terá a ação **Reenviar** em cada colaborador elegível.

Estados elegíveis:

- pendente;
- mensagem enviada;
- sem resposta;
- resposta incompreensível.

Estados bloqueados:

- confirmado;
- não comparecerá;
- cancelado;
- tratado manualmente.

Ao clicar:

- uma função transacional no Supabase valida novamente o estado atual;
- verifica se já existe um reenvio manual pendente ou processando;
- cria uma mensagem imediata usando o mesmo conteúdo contextual da operação;
- registra a ação na auditoria;
- devolve uma mensagem de sucesso ou uma explicação legível.

O reenvio terá chave única própria e não substituirá `confirmacao_inicial`, `lembrete_1` ou `lembrete_2`. Ele também não avançará os marcadores dos três envios automáticos.

## Banco e concorrência

Uma migration adicionará o tipo de fila `reenvio_manual` ao enum existente e criará as funções necessárias.

As decisões críticas ficarão no banco:

- cálculo dos horários;
- validação da equipe diária;
- criação idempotente dos registros;
- elegibilidade do reenvio;
- bloqueio de clique duplo;
- registro de auditoria.

O dashboard solicitará as operações, mas não será a autoridade final. Isso evita divergências quando dashboard, cron e bot executarem ao mesmo tempo.

As chaves únicas da fila continuarão sendo a principal proteção contra mensagens duplicadas.

## Dashboard

### Turnos

O fluxo será:

1. Selecionar empresa.
2. Selecionar Entrada/Saída.
3. Selecionar prioridade.
4. Criar ou selecionar o turno.
5. Informar data e Horário de Disparo.
6. Clicar em **Carregar equipe fixa**.
7. Revisar a equipe do dia.
8. Clicar em **Adicionar fila**.

O botão **Adicionar fila** ficará indisponível antes de a equipe ser carregada.

### Painel do Dia

A coluna Ações terá:

- **Reenviar**, somente quando elegível;
- **Tratar**, conforme o comportamento atual;
- **Apagar do painel**, conforme o comportamento atual.

Durante o reenvio, o botão ficará desabilitado. Depois da criação, a interface será atualizada para refletir a mensagem em fila.

### Colaboradores

A listagem continuará separando empresa e Entrada/Saída. Excluir da equipe removerá somente o vínculo daquela jornada. A exclusão total do cadastro continuará respeitando os vínculos existentes e as operações históricas.

## Auditoria

Serão registradas mensagens humanas para:

- equipe fixa carregada para revisão;
- fila diária criada com a quantidade de colaboradores;
- colaborador removido somente da equipe diária;
- colaborador adicional incluído somente na equipe diária;
- reenvio solicitado;
- reenvio rejeitado por estado encerrado ou duplicidade.

Dados técnicos permanecerão em `detalhes`, sem poluir o texto principal exibido ao usuário.

## Tratamento de erros

- Nenhuma equipe permanente: informar que a jornada ainda não possui colaboradores.
- Nenhum colaborador selecionado: não criar fila.
- Colaborador inativo: não incluir na equipe diária.
- Horário manual incompatível: manter a empresa, jornada, data e horário preenchidos para correção.
- Clique duplo em Reenviar: retornar que já há um reenvio aguardando envio.
- Resposta recebida durante a criação do reenvio: a validação transacional impede o novo envio.
- Falha de rede: mostrar erro sem limpar os campos ou a seleção do usuário.

## Testes

### Regras unitárias

- arredondamento de `13:48` para `14:00` e `14:30`;
- início em `13:00` gera `13:00`, `13:30` e `14:00`;
- virada do dia para entrada `00:00`;
- alerta em 1h30 antes;
- coincidência do terceiro envio desloca alerta em cinco minutos;
- horário manual tarde demais é rejeitado.

### Banco

- equipe fixa é filtrada por `empresa_horario_id`;
- fila diária contém somente selecionados;
- revisão diária não altera a equipe fixa;
- criação repetida da mesma fila não duplica registros;
- reenvio elegível é criado;
- reenvio de confirmado é rejeitado;
- clique duplo não duplica;
- resposta válida cancela automáticos e reenvios pendentes.

### Interface

- Carregar equipe fixa mostra a jornada correta;
- desmarcar colaborador não o exclui da equipe permanente;
- botão Adicionar fila depende da revisão;
- botão Reenviar aparece somente nos estados permitidos;
- mensagens de erro preservam a seleção.

### Fluxo completo

O teste ponta a ponta criará empresa, jornada, equipe permanente e fila diária, enviará a mensagem inicial, solicitará reenvio, registrará resposta e confirmará:

- atualização do Painel do Dia;
- cancelamento das mensagens restantes;
- persistência da resposta;
- auditoria;
- ausência de duplicidade.
