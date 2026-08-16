# Alertas sem retroatividade

## Objetivo

Garantir que todos os contatos de alerta ativos recebam eventos novos quase ao mesmo tempo, sem receber alertas de operações ocorridas antes do próprio cadastro.

## Regras

- Respostas negativas e respostas incompreensíveis devem gerar alertas para todos os contatos ativos, sem limite fixo de destinatários.
- Um contato cadastrado depois do vencimento de um alerta de ausência não recebe esse alerta antigo.
- Um contato cadastrado depois da última resposta incompreensível não recebe o alerta antigo correspondente.
- Alertas urgentes usam intervalo curto de 2 a 5 segundos entre destinatários, mantendo envio sequencial para não sobrecarregar o WhatsApp Web.
- As chaves únicas existentes continuam impedindo mensagens duplicadas.

## Implementação

- Remover o limite de dois contatos em `bot-register-incoming`.
- Criar uma migration que substitui `gerar_fila_confirmacoes()` e inclui o momento de cadastro do contato nos cruzamentos de alertas.
- Aplicar ao bot o mesmo intervalo curto já usado no lote inicial também para tipos `alerta_*`.
- Cobrir as três regras com testes estáticos de regressão e executar a suíte completa.

## Fora do escopo

- Alterar textos de alerta.
- Modificar contatos existentes.
- Mudar a fila de confirmações dos colaboradores.
