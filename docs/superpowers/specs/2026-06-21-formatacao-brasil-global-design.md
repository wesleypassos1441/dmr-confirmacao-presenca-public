# Formatacao Brasileira Global

## Objetivo

Manter datas persistidas em UTC/ISO e garantir que toda informacao exibida a usuarios seja convertida explicitamente para o calendario brasileiro e o fuso `America/Sao_Paulo`.

## Decisoes

- Datas sem horario (`YYYY-MM-DD`) sao formatadas por componentes, evitando mudanca acidental de dia.
- Instantes ISO sao convertidos com `Intl.DateTimeFormat` e fuso explicito.
- Templates operacionais formatam os proprios campos; chamadores passam valores crus do banco.
- Dashboard, pacote core e Edge Functions possuem um ponto central de formatacao em sua fronteira de runtime.
- Testes cobrem UTC-3, virada de dia e data sem horario.

## Escopo

Alertas de ausencia, alertas de resposta incompreensivel, auditoria e qualquer utilitario de apresentacao encontrado na varredura. O formato armazenado no banco nao sera alterado.
