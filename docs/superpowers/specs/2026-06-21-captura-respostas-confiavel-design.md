# Captura Confiavel de Respostas

## Objetivo

Processar somente respostas enviadas depois de uma mensagem de confirmacao efetivamente registrada como enviada, reconhecer remetentes identificados por LID no WhatsApp Business e recuperar automaticamente falhas temporarias de rede.

## Fluxo

1. O bot recebe um evento e preserva o horario original informado pelo WhatsApp.
2. Identificadores `@lid` sao convertidos para o numero telefonico real pela API instalada do `whatsapp-web.js`.
3. A Edge Function localiza o colaborador e exige `mensagem_enviada_em` anterior ou igual ao horario da resposta.
4. Respostas anteriores ao primeiro envio nao alteram a escala e nao geram orientacao automatica.
5. Falhas de rede usam retentativas e espera progressiva; o terminal informa a indisponibilidade sem repetir a mesma linha a cada ciclo.

## Limites

- Nao altera horarios, textos ou quantidade de disparos.
- Nao descarta respostas legitimas recebidas enquanto o bot estava desligado.
- Erros funcionais HTTP 4xx nao sao repetidos indefinidamente.

## Validacao

- Testes para LID, horario original, bloqueio antes do envio e aceite depois do envio.
- Testes para espera progressiva e recuperacao de rede.
- Suite completa, typecheck, lint, secrets scan e build.
