# Mensagens, respostas e agenda de confirmacao

## Objetivo

Melhorar a leitura das mensagens de confirmacao, interpretar respostas com seguranca e distribuir as tres tentativas ao longo da janela operacional. Nenhuma tentativa adicional deve ser enviada depois de uma resposta valida.

## Mensagens enviadas

Todas as tentativas devem usar texto curto, linhas separadas e o horario de entrada cadastrado.

Primeira tentativa:

```text
Bom dia, Pessoa Exemplo A.

Você confirma sua presença hoje na empresa Empresa Exemplo Alfa, às 08:00?

1 - Sim
2 - Não
```

O sistema deve usar `Bom dia`, `Boa tarde` ou `Boa noite` conforme o horario do envio.

Segundo lembrete:

```text
Bom dia, Pessoa Exemplo A.

Ainda não recebemos sua confirmação para a empresa Empresa Exemplo Alfa, às 08:00.

1 - Sim
2 - Não
```

Ultimo lembrete:

```text
Bom dia, Pessoa Exemplo A.

Este é o último lembrete para confirmar sua presença hoje na empresa Empresa Exemplo Alfa, às 08:00.

1 - Sim
2 - Não
```

O endereco da empresa nao sera incluido nessas mensagens. O foco sera nome, empresa, horario e opcoes de resposta.

## Interpretacao das respostas

Antes da classificacao, o sistema deve:

- remover espacos excedentes;
- converter o texto para minusculas;
- ignorar acentos;
- ignorar pontuacao simples;
- comparar palavras e expressoes completas, sem correspondencia parcial perigosa.

Respostas positivas reconhecidas incluem:

- `1`;
- `sim`, `s`, `si`, `yes`;
- `confirmo`, `confirmado`, `vou`, `irei`;
- `pode`, `pode contar`, `pode contar comigo`;
- `estarei presente`, `vou comparecer`, `eu vou`.

Respostas negativas reconhecidas incluem:

- `2`;
- `nao`, `n`, `no`;
- `nao vou`, `nao irei`, `nao comparecerei`;
- `nao posso`, `nao consigo`, `nao poderei`;
- `nao estarei presente`, `nao vou comparecer`;
- `estou impossibilitado`, `estou impossibilitada`.

Regras de seguranca:

- negativas sao avaliadas antes das positivas;
- uma frase com sinais contraditorios nao sera classificada automaticamente;
- o sistema nao classificara por simples substring;
- variacoes de maiusculas e minusculas produzem o mesmo resultado;
- respostas como `3`, `talvez`, `quem sabe` ou textos sem intencao clara sao incompreensiveis.

Para uma resposta incompreensivel, enviar uma unica orientacao imediata:

```text
Não consegui entender sua resposta.

Por favor, responda:
1 - Sim
2 - Não
```

Essa orientacao nao deve ser duplicada pela fila e pelo envio direto.

## Cancelamento apos resposta

Quando houver resposta positiva:

- registrar o colaborador como confirmado;
- cancelar os lembretes e o alerta sem resposta ainda nao enviados;
- responder com uma confirmacao curta.

Quando houver resposta negativa:

- registrar que o colaborador nao comparecera;
- cancelar os lembretes e o alerta sem resposta ainda nao enviados;
- avisar imediatamente os contatos ativos de alerta da DMR;
- responder ao colaborador com uma confirmacao curta.

Uma resposta incompreensivel nao cancela as tentativas programadas. Ela apenas registra a tentativa e solicita uma resposta valida.

O comportamento especial de `Mensagens para mim` nao sera alterado.

## Distribuicao das tentativas

O usuario informa:

- data;
- empresa e turno;
- horario de entrada;
- horario manual de inicio dos disparos.

O limite da janela e sempre uma hora antes da entrada:

```text
limite = horario de entrada - 60 minutos
```

O sistema deve rejeitar a criacao da fila quando o horario de inicio for igual ou posterior ao limite. A mensagem exibida sera:

```text
Inicie os disparos com mais de uma hora de antecedência.
```

Dentro da janela valida, as tres tentativas serao distribuidas proporcionalmente:

- primeira tentativa: no horario manual de inicio;
- segunda tentativa: aproximadamente em 40% da janela;
- terceira tentativa: aproximadamente em 80% da janela;
- alerta DMR: no limite de uma hora antes da entrada.

Exemplo para inicio `05:21` e entrada `08:00`:

- primeira tentativa: `05:21`;
- segunda tentativa: aproximadamente `06:01`;
- terceira tentativa: aproximadamente `06:40`;
- alerta aos contatos DMR: `07:00`.

Os horarios calculados sao alvos. Pequenos atrasos causados pela ordem da fila sao aceitaveis, mas uma tentativa nao pode ser agendada depois do alerta.

## Geracao e processamento da fila

A geracao da fila deve continuar idempotente: repetir a acao nao pode criar tentativas duplicadas.

Cada tentativa deve ser criada com seu proprio `agendado_para`. O bot envia apenas registros vencidos e pendentes. O intervalo tecnico entre mensagens de pessoas diferentes serve apenas para evitar disparos simultaneos; ele nao substitui os horarios operacionais calculados.

Antes de entregar um lembrete, o sistema deve considerar o estado atual da confirmacao. Registros cancelados por uma resposta valida nao podem voltar para `enviada`.

## Alertas DMR

Se nao houver resposta valida ate uma hora antes da entrada:

- criar um alerta de falta de resposta;
- enviar o alerta aos contatos ativos cadastrados em `Contatos de Alerta`;
- identificar colaborador, empresa e horario de entrada;
- evitar alertas duplicados para o mesmo colaborador e contato.

Uma resposta negativa continua produzindo alerta imediato, sem esperar o limite de uma hora.

## Alteracoes tecnicas

A implementacao deve abranger:

- biblioteca central de mensagens e normalizacao de respostas;
- nova migration para substituir a funcao SQL que calcula e cria a fila;
- Edge Function de respostas para cancelamento e orientacao sem duplicidade;
- validacao do horario no Dashboard antes de criar a operacao;
- testes unitarios das expressoes positivas, negativas, ambiguas e contraditorias;
- testes da agenda proporcional;
- testes estaticos da migration e do cancelamento dos lembretes.

## Criterios de aceite

- As tres mensagens possuem o formato visual definido.
- Nome, empresa e horario de entrada aparecem corretamente.
- `1` sempre significa sim e `2` sempre significa nao.
- Variacoes aprovadas de sim e nao sao reconhecidas sem depender de caixa ou acento.
- Respostas ambiguas nao sao classificadas como confirmacao ou negativa.
- Uma resposta valida cancela as tentativas restantes.
- Uma resposta invalida recebe somente uma orientacao por resposta.
- As tentativas seguem aproximadamente a proporcao 0%, 40% e 80% da janela.
- A fila e recusada quando comeca faltando uma hora ou menos.
- Sem resposta valida, os contatos DMR recebem o alerta uma hora antes da entrada.
- Nao ha tratamento adicional para `Mensagens para mim`.
