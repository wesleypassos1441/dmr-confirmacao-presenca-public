export type PrioridadeEnvio = 'alta' | 'normal';
export type TipoFila =
  | 'confirmacao_inicial'
  | 'lembrete_1'
  | 'lembrete_2'
  | 'resposta_incompreensivel'
  | 'alerta_sem_resposta'
  | 'alerta_resposta_incompreensivel'
  | 'alerta_resposta_incompreensivel_expirada'
  | 'alerta_nao_comparecera';

export function calcularAgendaFixaEnvio(input: {
  dataEscala: string;
  horarioInicioDisparo: string;
  horarioEntrada: string;
}): Record<'confirmacao_inicial' | 'lembrete_1' | 'lembrete_2' | 'alerta_sem_resposta', string>;
export function validarHorarioDisparoFuturo(input: {
  dataEscala: string;
  horarioInicioDisparo: string;
  nowIso?: string;
}): true;
export function resolverPrioridadeOperacional(input: {
  empresa?: PrioridadeEnvio | null;
  turno?: PrioridadeEnvio | null;
}): PrioridadeEnvio;
export function normalizarRespostaPresenca(value: unknown): {
  tipo: 'confirmado' | 'nao_comparecera' | 'incompreensivel';
  resposta_normalizada: 'sim' | 'nao' | null;
};
export function parseColaboradoresLote(value: unknown): Array<{
  nome: string;
  telefone: string;
}>;
export function normalizarTelefoneBrasil(value: unknown): string;
export function telefonesEquivalentesBrasil(value: unknown): string[];
export function gerarChaveFila(escalaColaboradorId: string, tipo: TipoFila, contatoAlertaId?: string | null): string;
export function mascararTelefone(value: unknown): string;
export function calcularTiposFilaPendentes(input: {
  agenda: Record<'confirmacao_inicial' | 'lembrete_1' | 'lembrete_2' | 'alerta_sem_resposta', string>;
  nowIso: string;
  statusConfirmacao: string;
  respondidoEm?: string | null;
  mensagemEnviadaEm?: string | null;
  primeiroLembreteEnviadoEm?: string | null;
  segundoLembreteEnviadoEm?: string | null;
  alertaSemRespostaEnviadoEm?: string | null;
  alertaIncompreensivelEnviadoEm?: string | null;
  tentativasIncompreensiveis?: number | null;
  ultimaRespostaIncompreensivelEm?: string | null;
}): TipoFila[];
export function buildPresenceMessage(input: {
  tipo: 'confirmacao_inicial' | 'lembrete_1' | 'lembrete_2';
  nowHour: number;
  colaboradorNome: string;
  empresaNome: string;
  empresaEndereco?: string | null;
  horarioEntrada: string;
  horarioSaida?: string | null;
}): string;
export function buildAbsenceAlert(input: {
  colaboradorNome: string;
  empresaNome: string;
  data: string;
  horarioInicio: string;
  respondidoEm: string;
}): string;
export function buildUnclearAlert(input: {
  colaboradorNome: string;
  empresaNome: string;
  data: string;
  horarioInicio: string;
  ultimaRespostaOriginal: string;
  expired?: boolean;
}): string;
export function formatDateBrazil(value: unknown): string;
export function formatTimeBrazil(value: unknown): string;
export function formatDateTimeBrazil(value: unknown): string;
