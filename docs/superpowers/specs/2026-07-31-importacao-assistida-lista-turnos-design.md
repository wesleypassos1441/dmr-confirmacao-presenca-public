# Importacao assistida de listas em Turnos

## Objetivo

Adicionar, dentro de `Turnos > Adicionar fila`, um fluxo facilitador que leia uma lista textual padronizada, identifique a operacao e os colaboradores, permita revisar e corrigir os cadastros e somente depois aplique a selecao a equipe do dia.

O fluxo atual de criacao de turno, carregamento da equipe fixa, reaproveitamento da ultima lista, inclusao manual e criacao da fila deve permanecer disponivel e com o mesmo comportamento.

## Formato de entrada

A importacao aceitara o seguinte formato obrigatorio:

```text
Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

Hugo Octavio Souza de Oliveira
Gabriel Silva da Cruz
Rafael Christian de Oliveira Souza
Warley Thiago da Silva
```

Regras:

- O cabecalho deve conter, nesta ordem, `Empresa`, `Entrada`, `Data` e `Disparo`.
- Os campos do cabecalho sao separados por ponto e virgula.
- A data deve usar `DD/MM/AAAA`.
- Entrada e disparo devem usar `HH:MM`.
- Cada linha nao vazia depois do cabecalho representa um colaborador.
- Nomes repetidos na mesma importacao devem aparecer apenas uma vez na revisao e gerar um aviso informativo.
- A lista deve conter pelo menos um nome.

## Fluxo da interface

Um painel expansivel `Importar lista` sera acrescentado dentro de `Adicionar fila`.

No inicio desse painel deve existir a ajuda expansivel `Ver modelo de preenchimento`. Ela deve:

- mostrar o exemplo completo do formato obrigatorio;
- explicar que cada colaborador ocupa uma linha;
- informar que os quatro campos do cabecalho devem ser mantidos;
- oferecer o botao `Copiar modelo`;
- permanecer acessivel mesmo depois de uma importacao ser interpretada;
- nao preencher ou substituir automaticamente um texto que o usuario ja tenha digitado.

1. O usuario abre o painel e cola o texto.
2. `Interpretar lista` valida o formato sem gravar dados e sem criar fila.
3. Os campos existentes de empresa, entrada/saida, data da operacao e horario de disparo sao preenchidos com os valores interpretados.
4. A tela mostra um resumo da operacao e classifica os nomes encontrados.
5. O usuario resolve cadastros novos, vinculos e ambiguidades.
6. `Aplicar a equipe do dia` transfere somente os colaboradores aprovados para a selecao normal.
7. O usuario ainda pode marcar ou desmarcar colaboradores.
8. O botao existente `Adicionar fila` continua sendo a unica confirmacao que programa a operacao.

`Cancelar importacao` deve descartar somente o rascunho importado. A equipe que estava selecionada antes da importacao deve ser restaurada, sem gravacoes parciais indevidas.

## Identificacao da operacao

- A empresa deve ser localizada entre as empresas ativas.
- A comparacao do nome da empresa ignora caixa, acentos e espacos excedentes.
- A entrada identifica uma unica jornada ativa da empresa.
- O turno operacional correspondente a empresa e jornada deve existir.
- Se a empresa, a entrada ou o turno nao forem encontrados, a importacao permanece em revisao e nenhuma selecao e aplicada.
- A data e o horario de disparo passam pela mesma validacao contra operacoes retroativas usada no fluxo atual.
- O horario de saida continua vindo da jornada cadastrada; ele nao precisa constar no texto importado.

## Identificacao dos colaboradores

A normalizacao usada apenas para comparacao deve:

- converter para minusculas;
- remover acentos;
- substituir sequencias de espacos por um unico espaco;
- remover espacos no inicio e no fim.

O nome original cadastrado ou importado deve ser preservado para exibicao, auditoria e mensagens.

A busca deve ocorrer nesta ordem:

### Ja faz parte da equipe

Quando houver exatamente um colaborador ativo, com nome normalizado correspondente e vinculo ativo com a empresa e jornada:

- marcar como `Pronto`;
- mostrar o telefone mascarado;
- selecionar automaticamente.

### Existe no Banco de colaboradores

Quando houver exatamente um colaborador ativo com nome correspondente, mas sem vinculo com a empresa e jornada:

- marcar como `Encontrado no banco`;
- exibir nome e telefone mascarado para conferencia;
- oferecer `Usar contato e vincular`, `Editar contato e vincular` e `Nao incluir`;
- nao criar outro cadastro.

Ao editar, o telefone deve ser normalizado no padrao brasileiro e atualizado no cadastro existente antes da criacao do vinculo.

### Nao cadastrado

Quando nao houver correspondencia:

- marcar como `Novo colaborador`;
- preencher automaticamente o nome;
- exigir telefone;
- validar e normalizar o telefone brasileiro;
- criar o colaborador e vincula-lo a empresa e jornada;
- selecionar o novo colaborador depois que a gravacao for confirmada.

### Homonimos e ambiguidades

Quando mais de um cadastro tiver o mesmo nome normalizado:

- nao selecionar automaticamente;
- mostrar as opcoes com telefone mascarado;
- exigir que o usuario escolha um cadastro ou informe que se trata de uma nova pessoa.

Quando nao houver correspondencia exata, o sistema podera reconhecer uma correspondencia
provavel somente entre colaboradores ja vinculados a empresa e jornada selecionadas. A
comparacao deve ignorar conectivos como `de`, `da`, `do`, `das` e `dos`, exigir o mesmo
primeiro nome e ao menos tres partes relevantes em comum. Acrescimos ou omissoes de um
sobrenome serao aceitos apenas quando houver um unico candidato.

Uma correspondencia provavel:

- sera selecionada automaticamente;
- usara uma cor exclusiva para chamar a atencao;
- mostrara o nome recebido, o nome cadastrado e o telefone mascarado;
- podera ser retirada da importacao pelo usuario.

Se houver dois candidatos provaveis na mesma equipe, nenhum sera escolhido
automaticamente. A selecao manual de homonimos continuara obrigatoria. Nomes parecidos
fora da equipe selecionada e coincidencias com menos de tres partes relevantes nao
serao associados.

## Prevencao de duplicidades

- Antes de criar ou atualizar um telefone, verificar os formatos brasileiros equivalentes ja cadastrados.
- Se o telefone pertencer a outro colaborador, bloquear a gravacao e mostrar o cadastro existente.
- Permitir selecionar o cadastro existente, corrigir o numero digitado ou nao incluir o nome.
- Vinculos existentes devem ser reutilizados ou reativados conforme as regras atuais.
- Uma falha ao salvar um colaborador nao deve gravar os demais resultados como se toda a revisao estivesse concluida.

## Estados visuais

- Verde: `Pronto`.
- Indigo: `Correspondencia provavel na equipe`.
- Azul: `Encontrado no banco`.
- Amarelo: `Novo colaborador`.
- Vermelho: `Requer correcao`.

O resumo deve mostrar:

- empresa;
- entrada/saida resolvida;
- data da operacao em formato brasileiro;
- horario de disparo;
- total de nomes;
- prontos;
- encontrados no banco;
- novos;
- pendencias.

Os nomes devem aparecer em ordem alfabetica. Telefones completos so devem aparecer dentro de controles de edicao; fora deles permanecem mascarados.

## Mensagens de validacao

As mensagens devem ser curtas e operacionais:

- `A empresa "Sete Lagos" nao foi encontrada.`
- `Nao existe uma entrada as 12:00 cadastrada para Sete Lagos.`
- `Nao existe um turno ativo para essa empresa e entrada.`
- `A data deve usar o formato DD/MM/AAAA.`
- `O horario de disparo informado ja passou.`
- `Informe o telefone de Warley Thiago da Silva.`
- `Foram encontrados dois colaboradores com esse nome. Selecione o cadastro correto.`
- `Este telefone ja pertence a outro colaborador. Confira o cadastro antes de continuar.`

Erros tecnicos do Supabase ou de validadores nao devem ser exibidos diretamente ao usuario.

## Estrutura tecnica

Para limitar o crescimento do componente principal, a implementacao deve separar:

- um parser puro para o cabecalho e os nomes;
- funcoes puras para normalizacao e classificacao dos colaboradores;
- um componente de importacao e revisao;
- adaptadores que reutilizem as operacoes existentes de edicao, vinculacao e criacao;
- a integracao final com o estado da equipe do dia em `Turnos`.

O rascunho da importacao fica apenas no estado local do navegador. Interpretar o texto nao grava nada. Cadastros e vinculos so sao gravados por acoes explicitas de salvamento durante a revisao. A fila so e criada pelo botao final ja existente.

O desenho nao exige uma migration nova. Se a implementacao demonstrar uma necessidade real de atomicidade ou seguranca que as operacoes existentes nao atendam, a alteracao de banco deve ser isolada, testada e documentada antes do deploy.

## Compatibilidade

Devem continuar funcionando:

- criacao de turno;
- selecao manual de empresa e jornada;
- carregamento da equipe fixa;
- reaproveitamento da ultima lista;
- inclusao de colaborador somente no dia;
- cadastro individual dentro de Turnos;
- cadastro em lote existente;
- marcacao e desmarcacao manual;
- criacao da fila pela RPC atual.

## Cenarios de teste

### Parser

- cabecalho valido;
- variacoes de espacos ao redor dos separadores;
- campo ausente ou fora de ordem;
- empresa vazia;
- horario invalido;
- data brasileira valida e invalida, inclusive ano bissexto;
- lista vazia;
- nomes repetidos;
- linhas vazias entre nomes.

### Identificacao

- colaborador ja vinculado a empresa e jornada;
- colaborador somente no Banco de colaboradores;
- colaborador inexistente;
- acentos, caixa e espacos diferentes;
- dois cadastros com o mesmo nome;
- mesmo nome em empresas diferentes;
- telefone em diferentes formatos brasileiros;
- telefone pertencente a outro cadastro.

### Fluxo

- interpretar sem gravar;
- abrir a ajuda e copiar o modelo sem alterar um rascunho existente;
- cancelar e restaurar a selecao anterior;
- editar contato existente sem duplicar cadastro;
- vincular contato existente;
- criar e vincular novo contato;
- impedir aplicacao com pendencias;
- aplicar somente os aprovados;
- marcar e desmarcar depois da aplicacao;
- impedir fila retroativa;
- criar a fila com empresa, jornada, data, disparo e colaboradores corretos;
- confirmar que o fluxo manual permanece funcional.

### Verificacao final

- testes unitarios;
- testes de integracao do dashboard;
- typecheck;
- scan de segredos;
- build de producao;
- teste visual em desktop e celular;
- validacao do fluxo completo ate a fila, sem disparar mensagens reais durante os testes automatizados.
