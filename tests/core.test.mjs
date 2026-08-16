import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPresenceMessage,
  calcularTiposFilaPendentes,
  calcularAgendaFixaEnvio,
  gerarChaveFila,
  mascararTelefone,
  normalizarRespostaPresenca,
  normalizarTelefoneBrasil,
  telefonesEquivalentesBrasil,
  validarHorarioDisparoFuturo,
  resolverPrioridadeOperacional,
  parseColaboradoresLote,
} from '../packages/core/src/index.mjs';

test('agenda fixa usa o horario manual e os proximos limites de meia hora', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '13:48',
    horarioEntrada: '16:00',
  }), {
    confirmacao_inicial: '2026-06-22T13:48:00-03:00',
    lembrete_1: '2026-06-22T14:00:00-03:00',
    lembrete_2: '2026-06-22T14:30:00-03:00',
    alerta_sem_resposta: '2026-06-22T14:35:00-03:00',
  });
});

test('agenda fixa avanca meia hora quando o disparo manual esta em um limite', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '13:00',
    horarioEntrada: '16:00',
  }), {
    confirmacao_inicial: '2026-06-22T13:00:00-03:00',
    lembrete_1: '2026-06-22T13:30:00-03:00',
    lembrete_2: '2026-06-22T14:00:00-03:00',
    alerta_sem_resposta: '2026-06-22T14:30:00-03:00',
  });
});

test('agenda fixa aceita disparo noturno para entrada na virada do dia', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '21:48',
    horarioEntrada: '00:00',
  }), {
    confirmacao_inicial: '2026-06-22T21:48:00-03:00',
    lembrete_1: '2026-06-22T22:00:00-03:00',
    lembrete_2: '2026-06-22T22:30:00-03:00',
    alerta_sem_resposta: '2026-06-22T22:35:00-03:00',
  });
});

test('nao permite criar fila com horario de disparo retroativo no mesmo dia', () => {
  assert.throws(() => validarHorarioDisparoFuturo({
    dataEscala: '2026-06-24',
    horarioInicioDisparo: '11:00',
    nowIso: '2026-06-24T19:56:00-03:00',
  }), /Horario de Disparo ja passou/);
});

test('permite criar fila para horario futuro no mesmo dia ou em data futura', () => {
  assert.equal(validarHorarioDisparoFuturo({
    dataEscala: '2026-06-24',
    horarioInicioDisparo: '20:00',
    nowIso: '2026-06-24T19:56:00-03:00',
  }), true);

  assert.equal(validarHorarioDisparoFuturo({
    dataEscala: '2026-06-25',
    horarioInicioDisparo: '06:00',
    nowIso: '2026-06-24T19:56:00-03:00',
  }), true);
});

test('no minuto atual exige pelo menos o minuto seguinte para criar a fila', () => {
  assert.throws(() => validarHorarioDisparoFuturo({
    dataEscala: '2026-07-24',
    horarioInicioDisparo: '21:10',
    nowIso: '2026-07-24T21:10:00-03:00',
  }), /Horario de Disparo ja passou/);

  assert.equal(validarHorarioDisparoFuturo({
    dataEscala: '2026-07-24',
    horarioInicioDisparo: '21:11',
    nowIso: '2026-07-24T21:10:59-03:00',
  }), true);
});

test('agenda fixa permite segundo lembrete depois do alerta sem interromper o fluxo', () => {
  assert.deepEqual(calcularAgendaFixaEnvio({
    dataEscala: '2026-06-22',
    horarioInicioDisparo: '14:01',
    horarioEntrada: '16:00',
  }), {
    confirmacao_inicial: '2026-06-22T14:01:00-03:00',
    lembrete_1: '2026-06-22T14:30:00-03:00',
    lembrete_2: '2026-06-22T15:00:00-03:00',
    alerta_sem_resposta: '2026-06-22T14:30:00-03:00',
  });
});

test('agenda fixa rejeita data de calendario invalida', () => {
  assert.throws(() => calcularAgendaFixaEnvio({
    dataEscala: '2026-02-31',
    horarioInicioDisparo: '13:00',
    horarioEntrada: '16:00',
  }), /Data da escala invalida/i);
});

test('prioridade operacional usa o turno como fonte principal e ignora empresa', () => {
  assert.equal(resolverPrioridadeOperacional({ empresa: 'alta' }), 'normal');
  assert.equal(resolverPrioridadeOperacional({ empresa: 'alta', turno: 'normal' }), 'normal');
  assert.equal(resolverPrioridadeOperacional({ empresa: 'normal', turno: 'alta' }), 'alta');
});

test('parse de colaboradores em lote aceita linha, virgula e ponto e virgula', () => {
  assert.deepEqual(parseColaboradoresLote(`
Pessoa C: 10900000014
Pessoa Exemplo A: 10900000015
Pessoa Exemplo B: 10900000016
  `), [
    { nome: 'Pessoa C', telefone: '5510900000014' },
    { nome: 'Pessoa Exemplo A', telefone: '5510900000015' },
    { nome: 'Pessoa Exemplo B', telefone: '5510900000016' },
  ]);

  assert.deepEqual(parseColaboradoresLote('Pessoa Exemplo A: 10900000012, Pessoa C: 10900000013, Pessoa Exemplo B: 10900000017'), [
    { nome: 'Pessoa Exemplo A', telefone: '5510900000012' },
    { nome: 'Pessoa C', telefone: '5510900000013' },
    { nome: 'Pessoa Exemplo B', telefone: '5510900000017' },
  ]);

  assert.deepEqual(parseColaboradoresLote('Pessoa Exemplo A: 10900000012 ; Pessoa C: 10900000013 ; Pessoa Exemplo B: 10900000017'), [
    { nome: 'Pessoa Exemplo A', telefone: '5510900000012' },
    { nome: 'Pessoa C', telefone: '5510900000013' },
    { nome: 'Pessoa Exemplo B', telefone: '5510900000017' },
  ]);
});

test('normaliza telefones brasileiros para formato do WhatsApp', () => {
  for (const value of [
    '31 9 96671334',
    '31 9 9667-1334',
    '(10)900000012',
    '(31) 9 96671334',
    '(31) 9 9667-1334',
    '+55 (31) 9 9667-1334',
  ]) {
    assert.equal(normalizarTelefoneBrasil(value), '5510900000012');
  }
});

test('gera telefones equivalentes para compatibilidade com cadastros antigos', () => {
  assert.deepEqual(telefonesEquivalentesBrasil('(31) 9 9667-1334'), ['5510900000012', '10900000012']);
  assert.deepEqual(telefonesEquivalentesBrasil('+55 (31) 9 9667-1334'), ['5510900000012', '10900000012']);
});

test('parse de colaboradores em lote rejeita item sem separador claro', () => {
  assert.throws(
    () => parseColaboradoresLote('Pessoa C 10900000014 Pessoa Exemplo A 10900000015'),
    /Nome: telefone/i,
  );
});

test('normaliza respostas positivas, negativas e incompreensiveis', () => {
  for (const value of [
    '1', 'sim', 'SIM', 's', 'Si', 'yes', 'confirmo', 'confirmado',
    'vou', 'irei', 'pode', 'pode contar', 'pode contar comigo',
    'estarei presente', 'vou comparecer', 'eu vou',
  ]) {
    assert.deepEqual(normalizarRespostaPresenca(value), { tipo: 'confirmado', resposta_normalizada: 'sim' });
  }

  for (const value of [
    '2', 'não', 'NAO', 'n', 'no', 'não vou', 'nao irei',
    'não consigo', 'não posso', 'não poderei', 'não comparecerei',
    'não estarei presente', 'não vou comparecer', 'estou impossibilitado',
  ]) {
    assert.deepEqual(normalizarRespostaPresenca(value), { tipo: 'nao_comparecera', resposta_normalizada: 'nao' });
  }

  assert.deepEqual(normalizarRespostaPresenca('talvez eu consiga'), { tipo: 'incompreensivel', resposta_normalizada: null });
  assert.deepEqual(normalizarRespostaPresenca('sim, mas não vou'), { tipo: 'incompreensivel', resposta_normalizada: null });
  assert.deepEqual(normalizarRespostaPresenca('3'), { tipo: 'incompreensivel', resposta_normalizada: null });
  assert.deepEqual(normalizarRespostaPresenca(''), { tipo: 'incompreensivel', resposta_normalizada: null });
});

test('gera chaves estaveis para evitar duplicidade na fila', () => {
  assert.equal(gerarChaveFila('abc', 'confirmacao_inicial'), 'abc:confirmacao_inicial');
  assert.equal(gerarChaveFila('abc', 'alerta_nao_comparecera', 'contato-1'), 'abc:alerta_nao_comparecera:contato-1');
});

test('mascara telefone sem remover utilidade operacional', () => {
  assert.equal(mascararTelefone('+55 11 98765-4321'), '+55 11 *****-4321');
  assert.equal(mascararTelefone('11987654321'), '119****4321');
  assert.equal(mascararTelefone('1234'), '****');
});

test('mensagem usa saudacao por horario, negrito, endereco e jornada', () => {
  const message = buildPresenceMessage({
    tipo: 'confirmacao_inicial',
    nowHour: 7,
    colaboradorNome: 'Pessoa Exemplo A',
    empresaNome: 'Empresa Exemplo Alfa',
    empresaEndereco: 'Rua Exemplo, 100 - Centro, Cidade Exemplo',
    horarioEntrada: '08:00',
    horarioSaida: '18:00',
  });

  assert.equal(message, `Bom dia *Pessoa Exemplo A*. Você poderá comparecer na empresa *EMPRESA EXEMPLO ALFA* hoje?

Endereço: *Rua Exemplo, 100 - Centro, Cidade Exemplo*

Horário: *08:00 as 18:00*

1 - SIM
2 - NÃO`);

  const reminder = buildPresenceMessage({
    tipo: 'lembrete_1',
    nowHour: 12,
    colaboradorNome: 'Ana',
    empresaNome: 'Empresa Beta',
    empresaEndereco: 'Rua A, 10 - Centro, Contagem',
    horarioEntrada: '14:00',
    horarioSaida: '22:00',
  });
  assert.match(reminder, /^Boa tarde \*Ana\*\./);
  assert.match(reminder, /Ainda precisamos da sua resposta\./);
  assert.match(message, /1 - SIM/);
  assert.match(message, /2 - NÃO/);

  assert.match(buildPresenceMessage({
    tipo: 'confirmacao_inicial',
    nowHour: 22,
    colaboradorNome: 'Pessoa C',
    empresaNome: 'Empresa Alfa',
    empresaEndereco: 'Rua B, 20',
    horarioEntrada: '03:00',
    horarioSaida: '12:00',
  }), /^Boa noite \*Pessoa C\*\./);
});

test('nao cria lembrete ou alerta depois de resposta valida', () => {
  const agenda = calcularAgendaFixaEnvio({
    dataEscala: '2026-06-19',
    horarioInicioDisparo: '05:21',
    horarioEntrada: '08:00',
  });

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-19T07:30:00-03:00',
    statusConfirmacao: 'confirmado',
    respondidoEm: '2026-06-19T07:05:00-03:00',
  }), []);

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-19T07:30:00-03:00',
    statusConfirmacao: 'nao_comparecera',
    respondidoEm: '2026-06-19T07:05:00-03:00',
  }), []);
});

test('cria somente etapas vencidas e ainda nao registradas', () => {
  const agenda = calcularAgendaFixaEnvio({
    dataEscala: '2026-06-19',
    horarioInicioDisparo: '09:00',
    horarioEntrada: '12:00',
  });

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-19T09:35:00-03:00',
    statusConfirmacao: 'mensagem_enviada',
    mensagemEnviadaEm: '2026-06-19T10:00:10-03:00',
  }), ['lembrete_1']);
});

test('nao cria alerta sem resposta antes dos tres envios reais', () => {
  const agenda = calcularAgendaFixaEnvio({
    dataEscala: '2026-06-24',
    horarioInicioDisparo: '06:00',
    horarioEntrada: '08:00',
  });

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-24T07:40:00-03:00',
    statusConfirmacao: 'pendente',
  }), ['confirmacao_inicial']);

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-24T07:40:00-03:00',
    statusConfirmacao: 'mensagem_enviada',
    mensagemEnviadaEm: '2026-06-24T06:01:00-03:00',
    primeiroLembreteEnviadoEm: '2026-06-24T06:31:00-03:00',
  }), ['lembrete_2']);

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-24T07:40:00-03:00',
    statusConfirmacao: 'mensagem_enviada',
    mensagemEnviadaEm: '2026-06-24T06:01:00-03:00',
    primeiroLembreteEnviadoEm: '2026-06-24T06:31:00-03:00',
    segundoLembreteEnviadoEm: '2026-06-24T07:01:00-03:00',
  }), ['alerta_sem_resposta']);
});

test('alerta resposta incompreensivel apos 3 tentativas ou apos 30 minutos sem resposta valida', () => {
  const agenda = calcularAgendaFixaEnvio({
    dataEscala: '2026-06-19',
    horarioInicioDisparo: '09:00',
    horarioEntrada: '13:00',
  });

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-19T10:40:00-03:00',
    statusConfirmacao: 'resposta_incompreensivel',
    mensagemEnviadaEm: '2026-06-19T09:01:00-03:00',
    primeiroLembreteEnviadoEm: '2026-06-19T09:31:00-03:00',
    segundoLembreteEnviadoEm: '2026-06-19T10:01:00-03:00',
    tentativasIncompreensiveis: 3,
    ultimaRespostaIncompreensivelEm: '2026-06-19T10:10:00-03:00',
  }), ['alerta_resposta_incompreensivel']);

  assert.deepEqual(calcularTiposFilaPendentes({
    agenda,
    nowIso: '2026-06-19T10:41:00-03:00',
    statusConfirmacao: 'resposta_incompreensivel',
    mensagemEnviadaEm: '2026-06-19T09:01:00-03:00',
    primeiroLembreteEnviadoEm: '2026-06-19T09:31:00-03:00',
    segundoLembreteEnviadoEm: '2026-06-19T10:01:00-03:00',
    tentativasIncompreensiveis: 1,
    ultimaRespostaIncompreensivelEm: '2026-06-19T10:10:00-03:00',
  }), ['alerta_resposta_incompreensivel_expirada']);
});
