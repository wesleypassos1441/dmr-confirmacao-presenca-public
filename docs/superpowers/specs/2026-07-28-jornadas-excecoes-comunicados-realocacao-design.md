# Jornadas, excecoes, comunicados, falso positivo e realocacao

**Data:** 28/07/2026  
**Status:** desenho funcional aprovado; especificacao aguardando revisao final  
**Projeto:** DMR Confirmacao de Presenca

## 1. Objetivo

Tornar a operacao diaria mais flexivel sem comprometer os registros historicos que ja funcionam. O sistema devera:

- permitir editar jornadas fixas;
- representar horarios diferentes conforme o dia da semana;
- aplicar uma alteracao excepcional somente em uma data;
- enviar comunicados personalizados para uma empresa e jornada, com pre-visualizacao;
- registrar quando uma confirmacao se torna um falso positivo;
- informar um substituto sem apagar a resposta original;
- realocar um ou varios colaboradores entre jornadas ou empresas sem recadastra-los;
- manter auditoria, relatorios, fila e respostas consistentes em todos esses fluxos.

## 2. Principios obrigatorios

1. **Historico imutavel:** editar uma jornada ou um vinculo permanente nao altera operacoes, mensagens ou relatorios de datas anteriores.
2. **Operacao com fotografia propria:** ao adicionar uma fila, a empresa, endereco, jornada efetiva, data e equipe ficam registrados como estavam naquele momento.
3. **Sem duplicidade:** repetir uma acao, atualizar a pagina ou ocorrer uma nova tentativa de rede nao pode criar duas excecoes, dois comunicados ou duas realocacoes equivalentes.
4. **Acoes atomicas:** realocacao, falso positivo e substituicao devem terminar por completo ou nao alterar nada.
5. **Visibilidade compartilhada:** qualquer usuario autenticado e autorizado ve os mesmos dados atualizados; somente operadores podem modificar.
6. **Auditoria humana:** os registros usam nomes, empresas, jornadas, datas e descricoes compreensiveis, sem expor mensagens SQL ou detalhes internos.
7. **Compatibilidade:** empresas, jornadas, equipes fixas, filas e relatorios existentes continuam validos apos as migrations.

## 3. Modelo de jornadas

### 3.1 Jornada logica

`empresa_horarios` continua sendo a identidade da jornada a que uma equipe pertence. Ela mantem o horario base de entrada e saida e passa a poder ser editada pela tela de Empresas.

Uma edicao permanente afeta somente operacoes futuras que ainda nao foram criadas. Operacoes ja adicionadas ao Painel do Dia preservam sua fotografia.

### 3.2 Regras semanais

Cada jornada podera ter regras por dia da semana. Uma regra contem:

- jornada da empresa;
- dia da semana;
- horario de entrada;
- horario de saida;
- situacao ativa;
- usuario e data da ultima alteracao.

Exemplo para Sete Lagos:

| Dias | Entrada | Saida |
| --- | --- | --- |
| Segunda a quinta | 14:00 | 23:00 |
| Sexta | 12:00 | 21:00 |

Na interface, dias consecutivos com os mesmos horarios aparecem agrupados. No banco, cada dia continua sendo uma regra unica, o que evita interpretacoes ambiguas.

Registros atuais receberao regras de segunda a sexta com o horario que ja possuem. Nenhuma equipe atual sera desvinculada.

### 3.3 Excecao por data

Uma excecao substitui a regra semanal somente para uma data e uma jornada. Ela contem:

- empresa e jornada;
- data da operacao;
- entrada e saida excepcionais;
- motivo opcional;
- opcao de preparar comunicado;
- autoria e datas de criacao/alteracao.

Deve existir no maximo uma excecao ativa para a mesma jornada e data. Ao criar uma fila, a ordem de resolucao sera:

1. excecao da data;
2. regra do dia da semana;
3. horario base da jornada, para compatibilidade.

O dashboard identifica visualmente a origem como `Excecao do dia`, `Regra semanal` ou `Horario base`.

## 4. Fotografia da operacao

Ao adicionar uma fila, o fluxo transacional grava na operacao:

- empresa e jornada selecionadas;
- data;
- entrada e saida efetivas;
- origem do horario;
- horario inicial dos disparos;
- prioridade;
- colaboradores selecionados;
- endereco e tipo de contratacao usados nas mensagens.

As mensagens e os relatorios leem essa fotografia, nao o cadastro atual da empresa. Assim, editar posteriormente o endereco, a jornada ou o vinculo nao modifica o que ja ocorreu.

Uma excecao criada depois de a fila existir nao altera silenciosamente a operacao. O usuario recebe a opcao explicita `Aplicar a esta operacao`, com pre-visualizacao do impacto. Se aceitar, somente mensagens ainda pendentes sao reagendadas; mensagens enviadas permanecem no historico.

## 5. Edicao de jornadas na tela Empresas

Cada jornada exibira `Editar` e `Apagar`.

Ao editar, abre-se um formulario do proprio dashboard com:

- horario base de entrada e saida;
- regras semanais;
- validacao de formato e duracao;
- resumo das operacoes futuras ainda nao iniciadas que podem ser afetadas.

Salvar exige confirmacao apenas quando houver operacoes futuras. O sistema nunca usa `prompt`, `alert` ou telas nativas do navegador.

Apagar continua bloqueado quando houver dependencia que deva ser preservada. Nessa situacao, a mensagem orienta a realocar a equipe ou manter a jornada; o usuario nao ve erro de chave estrangeira.

## 6. Comunicados personalizados

### 6.1 Criacao

O Painel do Dia tera a acao `Enviar comunicado` por quadro de empresa e jornada. O formulario permite:

- data e empresa ja preenchidas pelo quadro;
- jornada selecionada;
- destinatarios: todos, somente pendentes ou selecao manual;
- assunto interno curto;
- corpo da mensagem;
- variaveis permitidas: `{nome}`, `{empresa}`, `{data}`, `{horario}`;
- agendamento imediato ou horario futuro valido;
- pre-visualizacao com um destinatario real mascarado.

Se a excecao de horario for criada antes da fila, o mesmo formulario pode ser aberto diretamente da excecao.

### 6.2 Regras de envio

O comunicado usa um novo tipo operacional de fila e nao conta como tentativa de confirmacao. Ele nao altera:

- status do colaborador;
- quantidade de lembretes;
- interpretacao das respostas;
- alerta de ausencia;
- relatorio de presenca.

Cada comunicado gera uma mensagem individual por destinatario para permitir personalizacao, rastreio e reenvio seguro. Uma chave idempotente impede duplicidade por comunicado e destinatario.

Antes de confirmar, a interface mostra quantidade de destinatarios, horario, empresa, jornada e texto final de exemplo.

## 7. Falso positivo e substituicao

### 7.1 Conceito

Falso positivo ocorre quando o colaborador confirmou e depois informou que nao podera comparecer. A resposta original `sim`, o texto recebido e o horario da confirmacao permanecem armazenados.

O operador usa `Tratar` e escolhe `Marcar como falso positivo`. O registro recebe:

- data e hora da reversao;
- usuario responsavel;
- motivo opcional;
- nome do substituto opcional;
- data e usuario da substituicao, quando houver.

### 7.2 Estado exibido

- falso positivo sem substituto: `Falso positivo`;
- falso positivo com substituto: `Substituido`;
- ausencia original sem substituto: `Nao comparecera`;
- ausencia original com substituto: `Substituido`.

A prioridade de exibicao sera: `Substituido` > `Falso positivo` > status de confirmacao original.

Informar ou trocar o substituto nao cria um novo colaborador automaticamente. E um registro operacional nominal, como ocorre hoje, e pode ser removido sem apagar o falso positivo.

### 7.3 Relatorios

O relatorio nominal apresenta, sem perder a resposta original:

- colaborador;
- confirmacao recebida;
- indicacao `Falso positivo` quando aplicavel;
- substituto;
- horarios da confirmacao e da reversao;
- usuario que realizou o tratamento.

O resumo separa `Nao comparecera`, `Falsos positivos` e `Substituidos`.

## 8. Realocacao de colaboradores

### 8.1 Realocacao permanente

Na tela Colaboradores, o operador pode selecionar uma ou varias pessoas e escolher:

- empresa de destino;
- jornada de destino;
- vigencia `Permanente`.

O vinculo ativo passa para o destino sem criar outro cadastro de pessoa ou telefone. Operacoes passadas nao mudam. Se o colaborador ja estiver no destino, a acao informa isso e nao duplica o vinculo.

### 8.2 Realocacao somente na data

No Painel do Dia, o operador pode mover uma ou varias pessoas para outro quadro com vigencia `Somente nesta data`.

A operacao preserva:

- cadastro e equipe fixa originais;
- mensagens ja enviadas;
- respostas e auditoria;
- relatorios de outras datas.

As mensagens pendentes incompatíveis com o quadro antigo sao canceladas de forma transacional. A pessoa e vinculada ao quadro de destino sem duplicidade e recebe as proximas mensagens conforme a nova operacao.

Se ja houve envio, a interface mostra essa informacao e oferece preparar um comunicado de realocacao. O comunicado nunca e enviado sem confirmacao e pre-visualizacao.

## 9. Interface e usabilidade

### Empresas

- cada empresa continua aparecendo uma vez;
- jornadas ficam recolhidas dentro da empresa;
- cada jornada mostra regras semanais, excecoes futuras, equipe vinculada e acoes;
- formularios de edicao usam paineis ou modais do sistema com `Cancelar` e `Salvar`.

### Painel do Dia

- cada quadro mostra jornada efetiva, origem e horario de disparo;
- acoes do quadro: editar disparo, alterar horario do dia, enviar comunicado e realocar;
- acoes por pessoa ficam agrupadas em `Tratar`, mantendo reenvio quando permitido;
- estados pendentes permanecem acima dos estados concluidos, em ordem alfabetica dentro de cada grupo.

### Colaboradores

- selecao individual ou em lote;
- acao `Realocar` com origem, destino, quantidade e resumo antes de salvar;
- empresa e jornada de destino nunca sao inferidas apenas pelo nome.

## 10. Seguranca e concorrencia

As alteracoes sensiveis serao executadas por funcoes SQL `security definer` restritas a usuarios autenticados com papel de operador. As funcoes validam novamente empresa, jornada, data, estado e destino; a validacao do frontend nao e considerada suficiente.

Atualizacoes concorrentes usam bloqueio da linha operacional. Se outro usuario alterar o mesmo registro enquanto um formulario estiver aberto, o sistema recarrega o estado e pede nova confirmacao, em vez de sobrescrever silenciosamente.

Nenhuma chave de servico ou segredo do bot sera exposta no dashboard ou no bundle do Netlify.

## 11. Auditoria

Devem ser registrados com linguagem humana:

- jornada criada, editada ou apagada;
- regra semanal criada, editada ou removida;
- excecao criada, aplicada ou cancelada;
- comunicado agendado, enviado, cancelado ou com erro;
- falso positivo marcado ou revertido;
- substituto informado, trocado ou removido;
- realocacao permanente ou somente na data.

Cada evento inclui usuario, data/hora de Brasilia, empresa, jornada, pessoas afetadas e valores anteriores/novos relevantes.

## 12. Tratamento de erros

- datas ou horarios invalidos geram mensagens em portugues e mantem os valores preenchidos;
- excecao duplicada abre a existente para edicao;
- destinatario sem WhatsApp valido e apresentado no resultado, sem impedir os demais;
- falha parcial de rede nao duplica mensagens na nova tentativa;
- operacao iniciada nunca e reescrita sem confirmacao explicita;
- dependencia de banco e traduzida para uma orientacao operacional, sem SQL bruto;
- filas canceladas preservam motivo, usuario e horario.

## 13. Estrategia de entrega

A implementacao sera dividida em modulos sequenciais:

1. modelo de dados, compatibilidade e fotografia da operacao;
2. edicao e regras semanais de jornadas;
3. excecoes por data e aplicacao controlada;
4. falso positivo e substituicao;
5. realocacao permanente e por data;
6. comunicados com pre-visualizacao;
7. relatorios, auditoria e acabamento visual;
8. verificacao ponta a ponta e deploy.

Cada modulo deve passar em seus testes antes do proximo. Nenhuma migration existente sera reescrita; as mudancas entram em novas migrations reversiveis por dados e compativeis com o ambiente remoto.

## 14. Testes e criterios de aceite

### Banco e regras

- migracao preserva todas as empresas, jornadas, vinculos e operacoes atuais;
- regra semanal resolve corretamente segunda a quinta e sexta;
- excecao prevalece somente na data configurada;
- fotografia impede que uma edicao futura altere mensagem ou relatorio antigo;
- funcoes rejeitam usuario sem permissao e operacao duplicada;
- realocacao em lote e atomica;
- falso positivo preserva a confirmacao original;
- comunicado nao altera status nem tentativas de confirmacao.

### Dashboard

- editar e salvar jornada sem dialogo nativo;
- criar, editar e cancelar excecao;
- pre-visualizar comunicado antes de enviar;
- selecionar e realocar uma ou varias pessoas;
- tratar confirmacao como falso positivo, com ou sem substituto;
- visualizar origem do horario e historico de auditoria;
- manter layout legivel em desktop e celular, sem sobreposicoes.

### Bot e fila

- mensagens de confirmacao continuam no modelo atual;
- comunicado chega somente aos destinatarios selecionados;
- resposta a comunicado nao e confundida com confirmacao quando nao houver pergunta operacional pendente;
- mudanca de jornada cancela apenas mensagens futuras incompatíveis;
- reinicio do bot nao duplica comunicados nem lembretes.

### Verificacao final

- testes unitarios do Node;
- testes SQL/pgTAP;
- typecheck;
- build do dashboard e do bot;
- scan de segredos;
- testes visuais com Playwright em desktop e celular;
- cenario ponta a ponta: jornada semanal, excecao, fila, resposta, falso positivo, substituto, realocacao, comunicado e relatorio.

## 15. Fora deste escopo

- cadastrar automaticamente o substituto como colaborador;
- enviar comunicados por canais diferentes do WhatsApp;
- alterar mensagens antigas ja enviadas;
- reconstruir operacoes historicas com base no cadastro atual;
- rotacionar numeros de WhatsApp;
- mudar a arquitetura de hospedagem do bot.

