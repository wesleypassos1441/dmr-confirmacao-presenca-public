# Recuperacao do runtime do WhatsApp

## Problema

Ao fechar a janela controlada pelo Puppeteer, o processo Node continuava ativo e gravava heartbeat `online`. Os envios falhavam com `Attempted to use detached Frame`, consumiam as tres tentativas e terminavam em `erro`.

## Decisao

- O navegador operacional sera headless por padrao; o navegador visual fica restrito ao pareamento.
- A saude considera simultaneamente o estado do cliente, a conexao do browser e a pagina aberta.
- Falhas de runtime do navegador devolvem a mensagem para `pendente` sem consumir tentativa operacional.
- O bot encerra com codigo 75 quando precisa reiniciar o navegador.
- `Ligar Bot DMR.cmd` reinicia automaticamente apenas para o codigo 75.
- Heartbeat `online` so sera enviado enquanto o runtime estiver saudavel.
- A recuperacao do incidente altera apenas as cinco mensagens da escala Empresa Exemplo Beta de 06/07/2026, 22:00, agendadas para 18:00 e falhadas com `detached Frame`.

## Seguranca

Nenhuma chave nova sera exposta. A devolucao da fila continua passando pela Edge Function autenticada com `DMR_BOT_TOKEN`.

## Validacao

- Testes unitarios classificam falhas de runtime e saude do navegador.
- Teste estatico valida o supervisor do executavel e modo headless.
- Testes completos, typecheck, build e varredura de segredos devem passar.
- A recuperacao no banco sera conferida pelos IDs e pelo estado final das cinco mensagens.
