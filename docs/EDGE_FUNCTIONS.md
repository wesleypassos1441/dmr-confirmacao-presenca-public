# Edge Functions

Funcoes ativas:

- `bot-next-message`
- `bot-mark-sent`
- `bot-register-incoming`
- `bot-register-error`
- `bot-health`

Funcoes do bot exigem header `x-dmr-bot-token` com `DMR_BOT_TOKEN`.

A rotina principal de fila fica somente no banco, em `public.gerar_fila_confirmacoes()`, chamada por `pg_cron` a cada minuto. Isso evita dois caminhos diferentes gerando mensagens.

Comportamentos implementados:

- Gera confirmacao inicial, lembrete 1, lembrete 2 e alerta sem resposta conforme horario manual de disparo e horario de entrada do turno.
- Respeita prioridade configurada no turno.
- Usa chaves unicas para nao duplicar mensagens.
- `bot-next-message` entrega somente a proxima mensagem vencida.
- `bot-mark-sent` registra envio e atualiza timestamps operacionais.
- `bot-register-incoming` interpreta `sim/nao/incompreensivel`, cancela lembretes pendentes quando ha resposta valida e cria alertas DMR quando necessario.
- `bot-register-error` registra erro sem expor telefone completo.
- `bot-health` registra heartbeat.

Deploy automatizado:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-functions-deploy.ps1
```

As funcoes do bot sao deployadas com `--no-verify-jwt` e continuam exigindo `DMR_BOT_TOKEN` no header.
