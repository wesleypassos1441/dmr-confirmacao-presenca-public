# Empresas, banco de colaboradores e historico operacional

## Objetivo

Separar o cadastro permanente das pessoas de seus vinculos temporais com empresas, permitir encerrar contratos sem destruir historico e tornar movimentacoes consultaveis e auditaveis.

## Regras de dominio

### Empresa

- `ativa`: aparece em seletores e pode receber novas operacoes.
- `desativada`: fica temporariamente fora da operacao e pode ser reativada.
- `contrato encerrado`: nao volta aos seletores operacionais, mas permanece em relatorios, auditoria e historico dos colaboradores.
- Empresa usada em operacoes nao e apagada fisicamente.
- Encerrar contrato desativa seus vinculos ativos de forma atomica e registra a movimentacao de cada colaborador.

Para manter compatibilidade, `empresas.ativa` continua existindo. O encerramento sera representado por `contrato_encerrado_em`, `contrato_encerrado_por` e `motivo_encerramento`.

### Colaborador

- `colaboradores` e o banco permanente de contatos.
- Remover uma pessoa de uma equipe nao apaga seu nome ou telefone.
- Uma pessoa pode ser vinculada novamente a outra empresa ou jornada sem novo cadastro.
- O telefone continua unico e normalizado.

### Vinculo e historico

- `empresa_colaboradores` representa a participacao atual ou encerrada em uma equipe.
- O encerramento usa desativacao logica do vinculo.
- Uma tabela imutavel de movimentacoes registra: colaborador, empresa, jornada, evento, data, usuario e observacao opcional.
- Eventos: adicionado, removido, realocado de, realocado para e removido por encerramento de contrato.
- Nome da empresa e jornada sao gravados como snapshot para o historico continuar legivel mesmo depois de alteracoes cadastrais.
- Vinculos existentes recebem um evento inicial idempotente durante a migracao.

## Operacoes atomicas

Escritas sensiveis serao feitas por RPCs `security definer`, restritas a operadores autenticados:

- alterar status ou encerrar contrato da empresa;
- remover colaborador da equipe com observacao opcional;
- vincular colaborador existente a uma jornada;
- realocar equipe preservando a assinatura atual da RPC e adicionando historico.

Falhas retornam mensagens operacionais em portugues e nao expõem SQL ou nomes de constraints.

## Interface

### Banco de colaboradores

- Nova navegacao `Banco de colaboradores`.
- Pesquisa por nome ou telefone, aceitando telefone formatado ou apenas digitos.
- Lista unica, em ordem alfabetica, com equipes atuais e acoes para editar, ver historico e vincular.
- Historico em modal/timeline com data brasileira, empresa, jornada, evento e observacao.

### Equipes por empresa

- A tela atual de colaboradores passa a se chamar `Equipes por empresa`.
- Mantem agrupamento por empresa e jornada, edicao e realocacao.
- `Remover da empresa` abre modal proprio com observacao opcional; o contato permanece no banco.
- Empresas desativadas ou encerradas nao aceitam novos vinculos.

### Empresas

- Acoes explicitas: Desativar, Reativar e Encerrar contrato.
- Encerrar contrato exige confirmacao e aceita motivo opcional.
- Empresas encerradas continuam consultaveis, identificadas visualmente como historicas.

### Jornada semanal

- Alterar `Entrada padrao` propaga imediatamente a entrada para todos os dias abaixo.
- Alterar `Saida padrao` propaga imediatamente a saida para todos os dias abaixo.
- Depois da propagacao, qualquer dia continua editavel individualmente.
- Dias inativos tambem recebem o novo padrao, para que usem o valor correto se forem ativados depois.

## Seguranca e compatibilidade

- Qualquer usuario autenticado autorizado continua vendo o mesmo painel compartilhado.
- RLS permanece ativa e a chave de servico nao vai para o frontend.
- Operacoes e relatórios antigos nao sao reescritos.
- A migracao e aditiva e repetivel; funcoes antigas usadas pelo dashboard mantem assinaturas compativeis.

## Criterios de aceite

1. Empresa pode ser desativada, reativada ou encerrada sem perder historico.
2. Remover da equipe nao remove o cadastro do colaborador.
3. Pesquisa encontra colaborador por nome e por qualquer trecho numerico do telefone.
4. Historico mostra entradas, saidas e realocacoes com datas e observacoes.
5. Colaborador removido pode ser vinculado novamente sem duplicar telefone.
6. Entrada/saida padrao atualizam todos os dias; edicao individual posterior permanece.
7. Testes, typecheck, scan de secrets e build passam.

