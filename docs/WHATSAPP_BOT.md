# WhatsApp Bot

O bot local usa Node.js, TypeScript, `whatsapp-web.js` e `LocalAuth`.

Ele nao recebe service role. Usa apenas:

- URL base das Edge Functions.
- `DMR_BOT_TOKEN`.
- intervalos configuraveis.

A sessao local do WhatsApp fica em `.wwebjs_auth/` e nunca deve ser versionada. O arquivo `.dmr-bot.lock` impede abrir duas instancias do bot usando a mesma sessao.

## Preparacao

Na raiz do projeto, copie `.env.example` para `.env` e preencha o mesmo
`DMR_BOT_TOKEN` configurado nos secrets do Supabase. O bot carrega esse arquivo
da raiz mesmo quando o npm executa o workspace interno.

## Operacao diaria

Abra `Ligar Bot DMR.cmd` na raiz do projeto. A janela aparece rapidamente e
fecha; o bot continua executando em segundo plano, sem ocupar a area de trabalho
ou a barra de tarefas.

Para conferir o funcionamento, abra `Status Bot DMR.cmd`. O comando apresenta:

- `ONLINE`: processo ativo e heartbeat recente confirmado no Supabase.
- `INICIANDO`: supervisor ativo enquanto o WhatsApp termina de conectar.
- `AGUARDANDO LOGIN`: navegador aberto, aguardando QR Code ou conclusao do login.
- `COM FALHA`: processo sem heartbeat recente ou falha informada pelo bot.
- `OFFLINE`: supervisor nao esta executando.

Para encerrar, abra `Desligar Bot DMR.cmd`. O script fecha somente a arvore de
processos pertencente a este projeto. Os detalhes tecnicos ficam em
`logs/bot-background.log`.

O comando abaixo permanece disponivel apenas para diagnostico manual:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-bot.ps1
```

Variaveis obrigatorias:

- `EDGE_FUNCTIONS_BASE_URL`
- `DMR_BOT_TOKEN`

Os intervalos de prioridade configurados no Dashboard sao retornados pela Edge
Function `bot-next-message`. As variaveis `BOT_*_SECONDS` do `.env` ficam como
fallback caso a configuracao remota esteja indisponivel ou invalida.

Quando uma nova autenticacao for necessaria, use `scripts/whatsapp-login.ps1`.
Depois do login, a operacao normal pode voltar ao modo oculto.

## Agenda automatica

A agenda local funciona de segunda a sexta:

- `05:50`: inicia o bot para carregar o WhatsApp antes dos primeiros disparos.
- `16:00`: inicia o guardiao inteligente. Ele mantem o bot ligado enquanto
  houver mensagens, lembretes, alertas ou relatorios validos no ciclo atual.
- Sem trabalho operacional, o guardiao encerra somente os processos do Bot DMR.
- Se a consulta ao Supabase falhar, o guardiao preserva o bot ligado.

O computador precisa estar ligado ou suspenso e com o usuario conectado ao
Windows. A tela pode permanecer bloqueada. Um computador completamente
desligado nao pode ser ligado pelo Agendador de Tarefas do Windows.

As filas, respostas e programacoes ficam salvas no Supabase. Reiniciar o bot ou
bloquear a tela nao apaga esses dados. O inicio automatico atrasado e aceito
somente em dia util e entre `05:50` e `16:00`, evitando inicio acidental no fim
de semana.

Use os atalhos da raiz do projeto:

- `Instalar Agenda Bot DMR.cmd`: instala ou atualiza as duas tarefas.
- `Status Agenda Bot DMR.cmd`: mostra estado, proxima e ultima execucao.
- `Remover Agenda Bot DMR.cmd`: remove somente as duas tarefas do Bot DMR.
- `Status Bot DMR.cmd`: mostra o estado do bot e um resumo da agenda.

Os horarios padrao e o intervalo do guardiao estao documentados no
`.env.example` como configuracoes nao secretas. Credenciais nunca sao gravadas
nas tarefas do Windows.

Formato de mensagem usado pelo sistema:

```text
Bom dia, Nome.

Você confirma sua presença hoje na empresa Empresa, às 08:00?

1 - Sim
2 - Não
```
