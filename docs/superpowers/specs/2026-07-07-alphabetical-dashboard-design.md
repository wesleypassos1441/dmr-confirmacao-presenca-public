# Ordenacao alfabetica do dashboard

## Objetivo

Organizar consistentemente entidades identificadas por nome em todo o dashboard e permitir limpar rapidamente a selecao da Equipe do dia.

## Regra central

Toda comparacao nominal usara `localeCompare` com localidade `pt-BR`, sem alterar os registros recebidos do banco. A ordenacao sera aplicada sobre copias dos arrays para evitar mutacao de estado React.

## Cobertura

- Empresas: nomes alfabeticos em seletores, grupos e listagens.
- Colaboradores: nomes alfabeticos em cadastro individual, lote, equipes fixas, seletores e listagens.
- Contatos de alerta: nomes alfabeticos na tabela.
- Turnos: empresas alfabeticas; jornadas permanecem ordenadas pelo horario dentro da empresa.
- Relatorios: empresas e colaboradores alfabeticos dentro de cada agrupamento.
- Configuracoes que exibem nomes: opcoes alfabeticas.
- Painel do Dia: grupos de empresa/turno alfabeticos; pessoas sem resposta aparecem antes das concluidas. Dentro de cada faixa de status, colaboradores ficam alfabeticos. Quando alguem confirma ou informa ausencia, desce para a faixa concluida sem perder a ordem alfabetica.

## Excecoes intencionais

- Auditoria permanece em ordem cronologica, pois a data do evento e sua chave operacional.
- Horarios e jornadas permanecem em ordem temporal.
- Prioridades e estados continuam seguindo a ordem de negocio, usando o nome apenas como desempate.

## Desmarcar todos

Na secao `Equipe do dia`, um botao `Desmarcar todos` ficara junto ao cabecalho e contador. O comando esvaziara apenas a selecao diaria atual, sem remover colaboradores da equipe fixa ou do banco. Quando nao houver selecionados, o botao ficara desabilitado.

## Testes

- Testes unitarios cobrirao comparacao alfabetica com acentos e caixa.
- Testes de agrupamento cobrirao pendentes antes de concluidos e ordem alfabetica dentro de cada faixa.
- Teste estatico garantira a existencia do botao e que ele limpa `colaboradoresSelecionados`.
- Suíte completa, typecheck, build e secrets scan devem permanecer verdes.

