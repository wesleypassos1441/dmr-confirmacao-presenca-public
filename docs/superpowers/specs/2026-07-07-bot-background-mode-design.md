# Bot DMR em segundo plano

## Objetivo

Permitir que o bot WhatsApp opere sem manter uma janela de terminal ocupando a area de trabalho ou a barra de tarefas, preservando controle simples para consultar seu estado e encerra-lo corretamente.

## Experiencia operacional

- `Ligar Bot DMR.cmd` inicia um supervisor oculto e encerra imediatamente a janela visivel usada para o clique.
- Se o bot ja estiver ativo, o inicializador nao cria outra instancia.
- `Status Bot DMR.cmd` mostra se o bot esta ativo e exibe o estado remoto mais recente quando disponivel.
- `Desligar Bot DMR.cmd` solicita ao supervisor que encerre o bot e seus processos filhos de forma controlada.
- O navegador do WhatsApp continua em modo headless. Nenhuma janela precisa permanecer aberta.

## Arquitetura

Um script PowerShell supervisor sera executado com `WindowStyle Hidden`. Ele iniciara o script operacional existente, preservara o reinicio automatico para o codigo reservado `75` e gravara sua identificacao em um arquivo de controle no diretorio do bot.

O controle nao dependera apenas de nomes genericos como `node.exe`. O arquivo de estado identificara o processo supervisor pertencente a este projeto, evitando encerrar outros projetos ou programas Node do computador.

## Logs e diagnostico

A saida padrao e os erros serao redirecionados para arquivos locais ignorados pelo Git. Os logs terao tamanho controlado ou rotacao simples para nao crescerem indefinidamente. O comando de status informara onde consultar o log mais recente.

## Seguranca e recuperacao

- O lock interno existente continuara impedindo duas instancias do bot.
- Um arquivo de controle antigo sera descartado se o processo registrado nao existir mais.
- O desligamento tentara encerrar primeiro o supervisor e seus descendentes associados.
- Nenhum token, senha ou conteudo do `.env` sera exibido nos comandos ou logs.
- Falhas transitorias de WhatsApp continuarao acionando reinicio automatico.

## Compatibilidade

O fluxo de mensagens, Supabase, dashboard, sessao WhatsApp e Edge Functions nao sera alterado. A mudanca ficara restrita a inicializacao, supervisao, status, desligamento e logs locais.

## Verificacao

Os testes devem comprovar:

1. O inicializador chama o supervisor em janela oculta.
2. Uma segunda execucao nao cria outro bot.
3. O status distingue processo ativo de arquivo de controle obsoleto.
4. O desligamento atua somente nos processos deste projeto.
5. O codigo de reinicio `75` mantem o supervisor ativo.
6. Testes existentes, typecheck, build e varredura de secrets continuam passando.

