# Supervisor de saude do Bot DMR

## Objetivo

Manter o Bot DMR operacional no Microsoft Edge dentro dos limites de memoria
disponiveis, preservar a autenticacao do WhatsApp e tornar falhas criticas
visiveis mesmo quando o proprio WhatsApp estiver indisponivel.

## Desenho aprovado

- A cada 3 segundos, o processo do bot verifica a pagina, o navegador e a fila.
- A cada 60 segundos, faz uma verificacao profunda e registra o heartbeat no
  Supabase.
- A cada 30 minutos de runtime disponivel, reinicia de forma supervisionada,
  aguardando o envio atual terminar.
- Todo reinicio supervisionado passa pela manutencao do perfil do Edge, que
  remove somente caches descartaveis. Cookies, IndexedDB, Local Storage,
  Session Storage e Preferences permanecem preservados.
- Pagina de Out of Memory, navegador desconectado e falha nativa de memoria com
  codigo 134 sao recuperaveis e reiniciam automaticamente.
- QR Code necessario, Out of Memory, falha persistente de fila, falha de envio,
  falha de registro da mensagem e desconexao geram:
  - notificacao local do Windows;
  - registro no log operacional;
  - heartbeat de falha visivel no Painel do Dia quando o processo ainda puder
    acessar o Supabase.
- Notificacoes iguais possuem intervalo minimo para evitar repeticao excessiva.

## Limites

O aviso local e o Painel do Dia nao dependem do envio pelo proprio WhatsApp.
Uma notificacao remota enquanto o computador estiver desligado ou sem internet
exigiria um canal externo, como e-mail, Telegram ou servico de monitoramento.

## Validacao

- Testes unitarios para classificacao de incidentes e reciclagem.
- Testes estaticos para temporizadores, eventos criticos, supervisor e
  preservacao da autenticacao.
- Build, typecheck, scan de secrets e suite completa antes da entrega.
