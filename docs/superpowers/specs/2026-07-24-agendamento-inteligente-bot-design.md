# Agendamento inteligente do Bot DMR

## Objetivo

Reduzir o consumo de memória do WhatsApp Web sem perder operações programadas. O bot deve funcionar automaticamente de segunda a sexta-feira, iniciar às 05:50 e tentar encerrar a partir das 16:00 somente quando não houver trabalho válido do dia a concluir.

O Supabase continua sendo a fonte de verdade. Fechar o bot não pode apagar empresas, turnos, equipes, operações, mensagens pendentes ou respostas.

## Diagnóstico atual

- O navegador controlado pelo WhatsApp Web é o principal consumidor de memória.
- O início em segundo plano já é idempotente: uma segunda execução não deve criar outro bot.
- A geração da fila já considera operações do dia atual e turnos noturnos iniciados no dia anterior.
- O bot já busca mensagens pendentes com `agendado_para <= agora`, permitindo recuperar um disparo cujo horário passou enquanto o bot estava desligado.
- A seleção atual da fila precisa de uma proteção explícita contra mensagens antigas que tenham permanecido pendentes de uma operação já encerrada.

## Janela operacional

### Início

- Criar uma tarefa do Agendador de Tarefas do Windows para segunda a sexta-feira, às 05:50.
- A tarefa chama o início em segundo plano existente, sem abrir outro processo se o bot já estiver rodando.
- Habilitar execução assim que possível quando o horário tiver sido perdido.
- Habilitar despertar do computador quando o Windows e o hardware permitirem.
- Se o computador estava completamente desligado, a tarefa roda quando o Windows voltar. O Windows não consegue ligar sozinho um computador desligado sem suporte e configuração adicional de BIOS.

### Encerramento

- Às 16:00, outra tarefa inicia a verificação de encerramento.
- Se não houver trabalho operacional válido, o bot encerra com segurança.
- Se houver trabalho, o bot permanece ligado e a verificação é repetida em intervalos curtos.
- O encerramento acontece assim que o último trabalho do dia for concluído.
- Uma nova execução às 05:50 encontra o bot já ativo e não cria duplicidade.

## Definição de trabalho pendente

O bot não pode encerrar enquanto existir pelo menos uma destas condições para uma operação válida:

- colaborador programado cujo primeiro disparo ainda precisa ser gerado ou enviado;
- mensagem com status `pendente` ou `processando`;
- lembrete futuro ainda aplicável a um colaborador sem resposta;
- alerta aos contatos da DMR ainda aplicável;
- relatório automático ainda aplicável ou aguardando envio;
- turno noturno válido iniciado no dia anterior e ainda em processamento.

Registros confirmados, recusados, cancelados ou tratados manualmente não mantêm o bot ligado, exceto quando ainda houver relatório operacional obrigatório a enviar.

## Retomada das programações

Quando o WhatsApp ficar pronto, o bot deve:

1. aguardar apenas o período curto de estabilização da sessão;
2. gerar as mensagens aplicáveis às operações válidas;
3. buscar mensagens vencidas e pendentes em ordem de prioridade e horário;
4. enviar todos os primeiros disparos elegíveis com o intervalo curto já configurado entre colaboradores;
5. registrar cada envio antes de avançar;
6. continuar lembretes, alertas e relatórios sem duplicidade.

Uma operação criada para uma data futura permanece salva e só entra na fila na data correta. Uma operação do dia cujo horário passou durante a inicialização deve ser retomada. Uma mensagem antiga de uma operação encerrada em outro dia não deve ser enviada.

## Proteção contra perda e duplicidade

- Manter as chaves únicas já usadas pela fila para impedir a criação repetida da mesma etapa.
- Manter a reivindicação de uma mensagem por alteração condicional de `pendente` para `processando`.
- Recuperar itens presos em `processando` após a janela de segurança existente.
- Adicionar uma rotina transacional no banco para classificar o trabalho operacional atual e cancelar somente filas antigas comprovadamente inválidas.
- Não cancelar filas futuras.
- Não cancelar o turno noturno válido do dia anterior.
- O desligamento deve afetar apenas os processos pertencentes ao bot e ao perfil de navegador dessa sessão.

## Agendamento e segurança

- Criar scripts próprios para instalar, consultar e remover as tarefas agendadas.
- Executar as tarefas com o usuário Windows atual e sem armazenar a senha da conta na tarefa.
- A sessão do usuário pode estar bloqueada, mas precisa continuar conectada ao Windows; após logout completo, o navegador local não pode ser iniciado com segurança na área de trabalho do usuário.
- Não colocar `DMR_BOT_TOKEN`, senha do banco, token `sbp_` ou qualquer segredo na linha de comando da tarefa.
- Os scripts continuam lendo o `.env` local ignorado pelo Git.
- Os nomes das tarefas devem ser estáveis e claros, por exemplo `DMR Bot - Iniciar` e `DMR Bot - Encerramento inteligente`.
- A instalação deve poder ser executada novamente sem duplicar tarefas.
- O status deve informar horário das tarefas, última execução, próximo início e estado atual do bot.

## Falhas e recuperação

- O supervisor continua reiniciando falhas temporárias com espera progressiva, evitando abrir e fechar o navegador continuamente.
- Falha de internet ou Supabase mantém a mensagem disponível para nova tentativa de acordo com as regras atuais.
- Falha temporária da sessão do WhatsApp não consome definitivamente a tentativa da mensagem.
- Se o WhatsApp exigir novo login, o status deve deixar claro que a automação está ativa, mas aguardando autenticação.

## Testes obrigatórios

### Agenda do Windows

- segunda a sexta às 05:50;
- nenhuma inicialização agendada no sábado ou domingo;
- início perdido executado assim que possível;
- duas solicitações de início mantêm somente um supervisor;
- encerramento às 16:00 quando não há trabalho;
- permanência após 16:00 quando há trabalho;
- encerramento depois que o trabalho termina.

### Fila e banco

- operação futura não é enviada antecipadamente;
- operação do dia é reconhecida ao ligar o bot;
- disparo vencido durante a inicialização é retomado;
- todos os colaboradores programados e elegíveis entram no primeiro lote;
- fila antiga de operação encerrada não é enviada;
- turno noturno válido do dia anterior continua funcionando;
- nenhuma mensagem é duplicada após reinício;
- relatório e alerta aplicáveis impedem o encerramento prematuro.

### Regressão

- testes unitários completos;
- typecheck;
- build do bot e do dashboard;
- scan de segredos;
- validação sintática dos scripts PowerShell;
- teste controlado de instalação, consulta e remoção das tarefas;
- teste de ponta a ponta com uma operação de data e horário próximos.

## Critérios de aceite

- De segunda a sexta, o bot inicia automaticamente às 05:50 quando o computador está disponível.
- Se o horário for perdido, o bot inicia assim que possível e reconhece os colaboradores programados para a operação válida.
- O bot não perde nem duplica o primeiro envio após reinício.
- O bot não envia mensagens antigas de operações encerradas.
- Às 16:00, o bot só encerra quando não houver disparos, lembretes, alertas ou relatórios ainda aplicáveis.
- O consumo de memória do navegador é liberado depois do encerramento.
- O usuário consegue consultar claramente se o bot está online, aguardando login ou desligado e quais são os próximos horários automáticos.

## Limites externos

Esta solução garante o comportamento controlado pelo sistema, pelo banco e pelo Agendador do Windows. Entrega de mensagens ainda depende de computador ligado ou recuperado, usuário conectado ao Windows, internet, disponibilidade do Supabase, sessão autenticada e funcionamento do WhatsApp Web. Essas dependências devem aparecer no status e nos logs, sem transformar uma falha externa em perda silenciosa da fila.
