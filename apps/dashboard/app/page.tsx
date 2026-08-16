"use client";

import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import {
  Bell,
  Building2,
  ClipboardList,
  Clock3,
  Download,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { z } from "zod";
import { isSupabaseConfigured, supabase } from "../src/lib/supabase";
import { auditActorLabel, formatAuditMessage } from "../src/lib/audit";
import { formatDateBrazil, formatDateTimeBrazil, maskPhone, parseDateBrazil, today, toCsv } from "../src/lib/format";
import { buildSystemHealthSummary, humanizeSystemError, type SystemHealthSummary } from "../src/lib/health";
import { dashboardLoadErrorMessage, retryTransientDashboardLoad } from "../src/lib/network-recovery";
import { ScheduleEditor, type ScheduleEditorPayload, type ScheduleRuleInput } from "../src/components/ScheduleEditor";
import { ScheduleExceptionDialog, type ScheduleExceptionPayload } from "../src/components/ScheduleExceptionDialog";
import { OperationTreatmentDialog, type OperationTreatmentPayload } from "../src/components/OperationTreatmentDialog";
import { RelocationDialog, type RelocationResult } from "../src/components/RelocationDialog";
import { AnnouncementDialog, type AnnouncementPayload } from "../src/components/AnnouncementDialog";
import { CollaboratorHistoryDialog } from "../src/components/CollaboratorHistoryDialog";
import { CompanyLifecycleDialog, type CompanyLifecycleAction } from "../src/components/CompanyLifecycleDialog";
import { TeamRemovalDialog } from "../src/components/TeamRemovalDialog";
import {
  ShiftListImportPanel,
  type AppliedShiftListImport,
  type EnsureImportedShiftInput,
} from "../src/components/ShiftListImportPanel";
import { buildRelocationDestinations, operationResponseSummary, operationalDisplayStatus } from "../src/lib/operations";
import { filterCollaborators } from "../src/lib/collaborators";
import {
  buildNominalReportGroups,
  filterNominalReportGroups,
  type NominalReportFilter,
  type NominalReportItem,
} from "../src/lib/reports";
import { compareCompanyScheduleNameRows, compareNamesPtBr, comparePanelRows, sortByName } from "../src/lib/sort";
import {
  normalizarTelefoneBrasil,
  parseColaboradoresLote,
  telefonesEquivalentesBrasil,
  validarHorarioDisparoFuturo,
} from "@dmr-confirmacao/core";

type Tab =
  | "painel"
  | "empresas"
  | "turnos"
  | "banco_colaboradores"
  | "equipes"
  | "relatorios"
  | "contatos"
  | "logs"
  | "config";

const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "painel", label: "Painel do Dia", icon: <ClipboardList size={18} /> },
  { id: "empresas", label: "Empresas", icon: <Building2 size={18} /> },
  { id: "banco_colaboradores", label: "Banco de colaboradores", icon: <Users size={18} /> },
  { id: "equipes", label: "Equipes por empresa", icon: <Users size={18} /> },
  { id: "turnos", label: "Turnos", icon: <Clock3 size={18} /> },
  { id: "relatorios", label: "Relatórios", icon: <Download size={18} /> },
  { id: "contatos", label: "Contatos de Alerta", icon: <Bell size={18} /> },
  { id: "logs", label: "Auditoria", icon: <ShieldCheck size={18} /> },
  { id: "config", label: "Configurações", icon: <Settings size={18} /> },
];

const empresaSchema = z.object({
  nome: z.string().trim().min(2),
  tipo_contratacao: z.enum(["intermitente", "freelancer"]),
  endereco: z.string().trim().min(2),
  numero: z.string().trim().min(1),
  bairro: z.string().trim().min(2),
  cidade: z.string().trim().min(2),
});

const empresaHorarioSchema = z.object({
  empresa_id: z.string().trim().min(1),
  horario_entrada: z.string().trim().min(1),
  horario_saida: z.string().trim().min(1),
});

const colaboradorSchema = z.object({
  empresa_id: z.string().trim().min(1),
  empresa_horario_id: z.string().trim().min(1),
  nome: z.string().trim().min(2),
  telefone: z.string().trim().min(10),
});

const colaboradoresLoteSchema = z.object({
  empresa_id: z.string().trim().min(1),
  empresa_horario_id: z.string().trim().min(1),
  lote: z.string().trim().min(5),
});

const turnoSchema = z.object({
  empresa_id: z.string().trim().min(1),
  empresa_horario_id: z.string().trim().min(1),
  prioridade_envio: z.enum(["normal", "alta"]),
});

const operacaoManualSchema = z.object({
  empresa_id: z.string().trim().min(1),
  turno_empresa_id: z.string().trim().min(1),
  data: z.string().trim().min(1),
  horario_inicio_disparo: z.string().trim().min(1),
});

const contatoSchema = z.object({
  nome: z.string().trim().min(2),
  telefone: z.string().trim().min(10),
  notificar_de: z.string().trim().min(1),
  notificar_ate: z.string().trim().min(1),
});

type EditDialogField = {
  name: string;
  label: string;
  type?: string;
  value: string;
  options?: [string, string][];
};

type EditDialogState = {
  title: string;
  description?: string;
  fields: EditDialogField[];
  onSave: (values: Record<string, string>) => Promise<boolean | string | void>;
};

type BotInterval = {
  min_segundos?: number;
  max_segundos?: number;
};

type ConfigValue = {
  max_tentativas_envio?: number;
  max_respostas_incompreensiveis?: number;
  alta?: BotInterval;
  normal?: BotInterval;
  [key: string]: unknown;
};

type CreatedTurno = {
  empresaId: string;
  horarioId: string;
  turnoId: string;
};

type RelocationState = {
  mode: "permanent" | "date";
  origin: string;
  selectedIds: string[];
  currentScheduleId?: string;
};

type PainelGroup = {
  key: string;
  empresa: string;
  turno: string;
  prioridade: string;
  escalaId: string;
  turnoId: string;
  data: string;
  horarioDisparo: string;
  dispatchEditable: boolean;
  rows: DashboardRow[];
};

type AnnouncementState = {
  company: string;
  schedule: string;
  scheduleId: string;
  operationDate: string;
  rows: DashboardRow[];
};

type TeamRemovalState = {
  vinculoId: string;
  collaboratorName: string;
  companyName: string;
};

type CompanyLifecycleState = {
  company: DashboardRow;
  action: CompanyLifecycleAction;
};

type DashboardRow = {
  [key: string]: unknown;
  id: string;
  empresa_id: string;
  empresa_horario_id: string;
  colaborador_id: string;
  nome: string;
  telefone: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  horario_entrada: string;
  horario_saida: string;
  horario_inicio: string;
  prioridade_envio: string;
  ativo: boolean;
  status_confirmacao: string;
  resposta_normalizada: string;
  resposta_original: string;
  mensagem_enviada_em: string;
  primeiro_lembrete_enviado_em: string;
  segundo_lembrete_enviado_em: string;
  respondido_em: string;
  alerta_sem_resposta_enviado_em: string;
  alerta_incompreensivel_enviado_em: string;
  tratado_manualmente: boolean;
  substituto_nome: string;
  substituido_em: string;
  falso_positivo_em: string;
  falso_positivo_motivo: string;
  ator_email: string;
  acao: string;
  entidade: string;
  entidade_id: string;
  criado_em: string;
  contrato_encerrado_em: string;
  contrato_encerrado_por: string;
  motivo_encerramento: string;
  ocorrido_em: string;
  empresa_nome_snapshot: string;
  jornada_snapshot: string;
  observacao: string;
  tipo: string;
  chave: string;
  descricao: string;
  tipo_contratacao: string;
  title: string;
  summary: string;
  valor: ConfigValue;
  detalhes: Record<string, string | undefined>;
  escalas: {
    id: string;
    data: string;
    empresas: { id: string; nome: string; endereco: string; numero: string; bairro: string; cidade: string };
  };
  turnos_empresa: {
    id: string;
    nome: string;
    prioridade_envio: string;
    empresa_horarios: { id: string; horario_entrada: string; horario_saida: string };
  };
  colaboradores: { id: string; nome: string; telefone: string };
};

function empresaGrupoKey(nome: unknown) {
  return String(nome ?? "").trim().toLocaleLowerCase("pt-BR");
}

function empresaGrupoKeyPorId(empresas: DashboardRow[], empresaId: string) {
  return empresaGrupoKey(empresas.find((empresa) => empresa.id === empresaId)?.nome);
}

function empresaOptionsAgrupadas(empresas: DashboardRow[]) {
  const grouped = new Map<string, string>();
  for (const empresa of empresas.filter((row) => row.ativa !== false && !row.contrato_encerrado_em)) {
    const key = empresaGrupoKey(empresa.nome);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, String(empresa.nome ?? ""));
  }
  return [...grouped.entries()].sort((a, b) => compareNamesPtBr(a[1], b[1])) as [string, string][];
}

function empresaOptionsTodas(empresas: DashboardRow[]) {
  const grouped = new Map<string, string>();
  for (const empresa of empresas) {
    const key = empresaGrupoKey(empresa.nome);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, String(empresa.nome ?? ""));
  }
  return [...grouped.entries()].sort((a, b) => compareNamesPtBr(a[1], b[1])) as [string, string][];
}

function empresaIdsDoGrupoTodas(empresas: DashboardRow[], grupoKey: string) {
  return empresas.filter((empresa) => empresaGrupoKey(empresa.nome) === grupoKey).map((empresa) => empresa.id);
}

function empresaRepresentanteDoGrupoTodas(empresas: DashboardRow[], grupoKey: string) {
  return empresas
    .filter((empresa) => empresaGrupoKey(empresa.nome) === grupoKey)
    .sort((a, b) => String(b.criado_em ?? "").localeCompare(String(a.criado_em ?? "")) || String(b.id).localeCompare(String(a.id)))
    .at(0);
}

function empresaIdsDoGrupo(empresas: DashboardRow[], grupoKey: string) {
  return empresas
    .filter((empresa) => empresa.ativa !== false && !empresa.contrato_encerrado_em && empresaGrupoKey(empresa.nome) === grupoKey)
    .map((empresa) => empresa.id);
}

function empresaRepresentanteDoGrupo(empresas: DashboardRow[], grupoKey: string) {
  return empresas
    .filter((empresa) => empresa.ativa !== false && !empresa.contrato_encerrado_em && empresaGrupoKey(empresa.nome) === grupoKey)
    .sort((a, b) => String(b.criado_em ?? "").localeCompare(String(a.criado_em ?? "")) || String(b.id).localeCompare(String(a.id)))
    .at(0)?.id ?? "";
}

function empresaIdDoHorario(empresaHorarios: DashboardRow[], horarioId: string) {
  return empresaHorarios.find((horario) => horario.id === horarioId)?.empresa_id ?? "";
}

function empresaIdDoTurno(turnos: DashboardRow[], turnoId: string) {
  return turnos.find((turno) => turno.id === turnoId)?.empresa_id ?? "";
}

function horarioOptionsPorGrupo(empresas: DashboardRow[], empresaHorarios: DashboardRow[], grupoKey: string) {
  const ids = new Set(empresaIdsDoGrupo(empresas, grupoKey));
  return empresaHorarios
    .filter((horario) => ids.has(horario.empresa_id) && horario.ativo !== false)
    .sort((a, b) => String(a.horario_entrada ?? "").localeCompare(String(b.horario_entrada ?? "")))
    .map((horario) => [horario.id, horarioLabel(horario)] as [string, string]);
}

function turnosPorGrupo(turnos: DashboardRow[], empresas: DashboardRow[], grupoKey: string) {
  const ids = new Set(empresaIdsDoGrupo(empresas, grupoKey));
  return turnos.filter((turno) => ids.has(turno.empresa_id) && turno.ativo !== false);
}

async function selectRows(table: string, columns: string): Promise<DashboardRow[]> {
  const { data: rows, error: queryError } = await supabase.from(table).select(columns);
  if (queryError) throw queryError;
  return (rows ?? []) as unknown as DashboardRow[];
}

function currentAuthUrlState() {
  if (typeof window === "undefined") return { expiredRecovery: false, passwordRecovery: false };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return {
    expiredRecovery: hash.get("error_code") === "otp_expired",
    passwordRecovery: query.get("reset") === "senha" || hash.get("type") === "recovery",
  };
}

export default function Home() {
  const [sessionReady, setSessionReady] = useState(!isSupabaseConfigured);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(() => currentAuthUrlState().passwordRecovery);
  const [activeTab, setActiveTab] = useState<Tab>("painel");
  const [error, setError] = useState(() => currentAuthUrlState().expiredRecovery ? "Este link de recuperação expirou. Solicite um novo link abaixo." : "");
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(today());
  const [data, setData] = useState<Record<string, DashboardRow[]>>({});
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [operationTreatment, setOperationTreatment] = useState<DashboardRow | null>(null);
  const [relocation, setRelocation] = useState<RelocationState | null>(null);
  const [announcement, setAnnouncement] = useState<AnnouncementState | null>(null);
  const [teamRemoval, setTeamRemoval] = useState<TeamRemovalState | null>(null);
  const [companyLifecycle, setCompanyLifecycle] = useState<CompanyLifecycleState | null>(null);
  const [historyCollaborator, setHistoryCollaborator] = useState<DashboardRow | null>(null);
  const refreshSequence = useRef(0);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      return () => { active = false; };
    }

    const timeout = window.setTimeout(() => {
      if (active) setSessionReady(true);
    }, 3000);

    supabase.auth.getSession().then(({ data: authData }) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setSessionEmail(authData.session?.user.email ?? null);
      setSessionReady(true);
    }).catch(() => {
      if (!active) return;
      window.clearTimeout(timeout);
      setSessionReady(true);
    });

    const authUrlState = currentAuthUrlState();
    if (authUrlState.expiredRecovery) {
      window.history.replaceState({}, document.title, window.location.origin);
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      setSessionEmail(session?.user.email ?? null);
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshAll = useCallback(async (targetDate = date) => {
    const requestId = ++refreshSequence.current;
    setLoading(true);
    setError("");
    try {
      const [empresas, empresaHorarios, regrasSemanais, excecoesHorario, turnos, colaboradores, vinculos, movimentacoes, painel, contatos, logs, config, botHeartbeats, filaMensagens, mensagensRecebidas] = await retryTransientDashboardLoad(() => Promise.all([
        selectRows("empresas", "id,nome,tipo_contratacao,endereco,numero,bairro,cidade,ativa,criado_em,contrato_encerrado_em,contrato_encerrado_por,motivo_encerramento"),
        selectRows("empresa_horarios", "id,empresa_id,horario_entrada,horario_saida,ativo"),
        selectRows("empresa_horario_regras_semanais", "id,empresa_horario_id,dia_semana,horario_entrada,horario_saida,ativo"),
        selectRows("empresa_horario_excecoes", "id,empresa_horario_id,data,horario_entrada,horario_saida,motivo,ativo"),
        selectRows("turnos_empresa", "id,empresa_id,empresa_horario_id,nome,horario_inicio,prioridade_envio,ativo"),
        selectRows("colaboradores", "id,nome,telefone,ativo"),
        selectRows("empresa_colaboradores", "id,empresa_id,empresa_horario_id,colaborador_id,ativo"),
        selectRows("colaborador_movimentacoes", "id,colaborador_id,empresa_id,empresa_horario_id,vinculo_id,tipo,ocorrido_em,observacao,empresa_nome_snapshot,jornada_snapshot"),
        supabase
          .from("escala_colaboradores")
          .select("id,horario_inicio,horario_inicio_disparo,status_confirmacao,resposta_normalizada,resposta_original,mensagem_enviada_em,primeiro_lembrete_enviado_em,segundo_lembrete_enviado_em,respondido_em,tentativas_incompreensiveis,alerta_sem_resposta_enviado_em,alerta_incompreensivel_enviado_em,tratado_manualmente,substituto_nome,substituido_em,falso_positivo_em,falso_positivo_motivo,escalas!inner(id,data,empresas!inner(id,nome,endereco,numero,bairro,cidade)),turnos_empresa!inner(id,nome,prioridade_envio,empresa_horarios(id,horario_entrada,horario_saida)),colaboradores!inner(id,nome,telefone)")
          .eq("escalas.data", targetDate)
          .order("horario_inicio", { ascending: true }),
        selectRows("contatos_alerta_dmr", "id,nome,telefone,notificar_de,notificar_ate,ativo"),
        supabase.from("logs_acoes").select("id,ator_email,acao,entidade,entidade_id,detalhes,criado_em").order("criado_em", { ascending: false }).limit(100),
        selectRows("configuracoes_sistema", "chave,valor,descricao"),
        supabase.from("bot_heartbeats").select("id,bot_id,status,detalhes,criado_em").order("criado_em", { ascending: false }).limit(20),
        supabase.from("fila_mensagens").select("id,tipo,status,agendado_para,enviada_em,ultimo_erro,criado_em,atualizado_em").order("criado_em", { ascending: false }).limit(200),
        supabase.from("mensagens_recebidas").select("id,recebida_em,status_interpretado,mensagem_original,resposta_normalizada,criado_em").order("recebida_em", { ascending: false }).limit(50),
      ]));

      if (requestId !== refreshSequence.current) return;
      setData({
        empresas: sortByName(empresas, (row) => row.nome),
        empresaHorarios,
        regrasSemanais,
        excecoesHorario,
        turnos,
        colaboradores: sortByName(colaboradores, (row) => row.nome),
        vinculos,
        movimentacoes,
        painel: (painel.data ?? []) as unknown as DashboardRow[],
        contatos: sortByName(contatos, (row) => row.nome),
        logs: (logs.data ?? []) as unknown as DashboardRow[],
        config,
        botHeartbeats: (botHeartbeats.data ?? []) as unknown as DashboardRow[],
        filaMensagens: (filaMensagens.data ?? []) as unknown as DashboardRow[],
        mensagensRecebidas: (mensagensRecebidas.data ?? []) as unknown as DashboardRow[],
      });
    } catch (err) {
      if (requestId === refreshSequence.current) setError(toMessage(err));
    } finally {
      if (requestId === refreshSequence.current) setLoading(false);
    }
  }, [date]);

  const changeDate = useCallback((nextDate: string) => {
    setDate(nextDate);
    void refreshAll(nextDate);
  }, [refreshAll]);

  useEffect(() => {
    if (!sessionEmail) return;
    const initialRefresh = window.setTimeout(() => void refreshAll(), 0);
    const channel = supabase
      .channel("dashboard-presenca")
      .on("postgres_changes", { event: "*", schema: "public", table: "escala_colaboradores" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "empresa_horario_regras_semanais" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "empresa_horario_excecoes" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "empresas" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "empresa_colaboradores" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "colaborador_movimentacoes" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "fila_mensagens" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_heartbeats" }, () => void refreshAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "mensagens_recebidas" }, () => void refreshAll())
      .subscribe();
    return () => {
      window.clearTimeout(initialRefresh);
      void supabase.removeChannel(channel);
    };
  }, [sessionEmail, refreshAll]);

  const healthSummary = useMemo(() => buildSystemHealthSummary({
    heartbeats: data.botHeartbeats ?? [],
    queue: data.filaMensagens ?? [],
    incoming: data.mensagensRecebidas ?? [],
    logs: data.logs ?? [],
  }), [data.botHeartbeats, data.filaMensagens, data.mensagensRecebidas, data.logs]);

  if (!sessionReady) return <main className="login"><div className="panel">Carregando...</div></main>;
  if (!isSupabaseConfigured) return <MissingEnv />;
  if (passwordRecovery) return <PasswordRecovery onDone={() => { setPasswordRecovery(false); setError(""); }} onError={setError} error={error} />;
  if (!sessionEmail) return <Login onError={setError} error={error} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>DMR</strong>
          <span>Confirmação de Presença</span>
        </div>
        <nav className="nav" aria-label="Navegação principal">
          {tabs.map((tab) => (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <button onClick={() => supabase.auth.signOut()}>
            <LogOut size={18} />
            Sair
          </button>
        </nav>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
            <div className="status-line">{sessionEmail} {loading ? "• atualizando" : ""}</div>
          </div>
          <button className="icon" onClick={() => void refreshAll()} aria-label="Atualizar dados" title="Atualizar dados">
            <RefreshCw size={18} />
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        {activeTab === "painel" ? <Painel rows={data.painel ?? []} date={date} setDate={changeDate} health={healthSummary} onTratado={markTratado} onDelete={apagarPainel} onReenviar={reenviarMensagem} onEditDispatch={editHorarioDisparo} onSubstitute={editSubstituto} onTreatment={setOperationTreatment} onRelocate={(selectedIds, origin, currentScheduleId) => setRelocation({ mode: "date", selectedIds, origin, currentScheduleId })} onAnnouncement={setAnnouncement} /> : null}
        {activeTab === "empresas" ? <Empresas rows={data.empresas ?? []} empresaHorarios={data.empresaHorarios ?? []} weeklyRules={data.regrasSemanais ?? []} exceptions={data.excecoesHorario ?? []} onCreate={createEmpresa} onCreateHorario={createEmpresaHorario} onDeleteHorario={deleteEmpresaHorario} onEdit={editEmpresa} onLifecycle={(company, action) => setCompanyLifecycle({ company, action })} onSaveWeekly={saveWeeklySchedule} onSaveException={saveScheduleException} /> : null}
        {activeTab === "turnos" ? <Turnos rows={data.turnos ?? []} filaRows={data.painel ?? []} empresas={data.empresas ?? []} empresaHorarios={data.empresaHorarios ?? []} colaboradores={data.colaboradores ?? []} vinculos={data.vinculos ?? []} onCreate={createTurno} onEnsureImportedShift={ensureImportedTurno} onCreateFila={gerarOperacaoManual} onCreateColaborador={createColaborador} onCreateBatch={createColaboradoresLote} onLinkImported={linkImportedCollaborator} onUpdateAndLinkImported={updateAndLinkImportedCollaborator} onCreateAndLinkImported={createAndLinkImportedCollaborator} /> : null}
        {activeTab === "banco_colaboradores" ? <BancoColaboradores rows={data.colaboradores ?? []} empresas={data.empresas ?? []} empresaHorarios={data.empresaHorarios ?? []} vinculos={data.vinculos ?? []} onEdit={editColaborador} onViewHistory={setHistoryCollaborator} onLink={openLinkCollaborator} /> : null}
        {activeTab === "equipes" ? <Colaboradores rows={data.colaboradores ?? []} empresas={data.empresas ?? []} empresaHorarios={data.empresaHorarios ?? []} vinculos={data.vinculos ?? []} onCreate={createColaborador} onCreateBatch={createColaboradoresLote} onEdit={editColaborador} onRequestRemove={setTeamRemoval} onRelocate={(selectedIds, origin, currentScheduleId) => setRelocation({ mode: "permanent", selectedIds, origin, currentScheduleId })} /> : null}
        {activeTab === "relatorios" ? <Relatorios key={date} rows={data.painel ?? []} date={date} setDate={changeDate} onSendWhatsAppReport={enviarRelatorioWhatsApp} /> : null}
        {activeTab === "contatos" ? <Contatos rows={data.contatos ?? []} onCreate={createContato} onEdit={editContato} onDelete={deleteContato} /> : null}
        {activeTab === "logs" ? <Logs rows={data.logs ?? []} onClear={clearLogs} /> : null}
        {activeTab === "config" ? <Config rows={data.config ?? []} onSaveConfig={saveConfig} /> : null}
        {editDialog ? <EditDialog state={editDialog} onClose={() => setEditDialog(null)} /> : null}
        {operationTreatment ? (
          <OperationTreatmentDialog
            open
            record={{
              id: operationTreatment.id,
              collaboratorName: operationTreatment.colaboradores?.nome ?? "Colaborador",
              companyName: operationTreatment.escalas?.empresas?.nome ?? "Empresa",
              falsePositiveAt: operationTreatment.falso_positivo_em,
              reason: operationTreatment.falso_positivo_motivo,
              substituteName: operationTreatment.substituto_nome,
            }}
            onClose={() => setOperationTreatment(null)}
            onSave={saveOperationTreatment}
          />
        ) : null}
        {relocation ? (
          <RelocationDialog
            open
            mode={relocation.mode}
            origin={relocation.origin}
            selectedIds={relocation.selectedIds}
            destinations={buildRelocationDestinations({
              currentScheduleId: relocation.currentScheduleId,
              schedules: (data.empresaHorarios ?? []).filter((item) => item.ativo !== false).map((item) => ({
                scheduleId: item.id,
                company: empresaNome(data.empresas ?? [], item.empresa_id),
                label: horarioLabel(item),
              })),
            })}
            onConfirm={(destinationId) => runRelocation(relocation, destinationId)}
            onPrepareAnnouncement={(destinationId) => prepareAnnouncementAfterRelocation(relocation, destinationId)}
            onClose={() => setRelocation(null)}
          />
        ) : null}
        {announcement ? (
          <AnnouncementDialog
            open
            company={announcement.company}
            schedule={announcement.schedule}
            scheduleId={announcement.scheduleId}
            operationDate={announcement.operationDate}
            recipients={announcement.rows.map((row) => ({
              id: row.id,
              name: row.colaboradores?.nome ?? "Colaborador",
              status: row.status_confirmacao,
            }))}
            onConfirm={createAnnouncement}
            onClose={() => setAnnouncement(null)}
          />
        ) : null}
        {teamRemoval ? (
          <TeamRemovalDialog
            open
            collaboratorName={teamRemoval.collaboratorName}
            companyName={teamRemoval.companyName}
            onClose={() => setTeamRemoval(null)}
            onConfirm={(observation) => removerColaboradorEquipe(teamRemoval.vinculoId, observation)}
          />
        ) : null}
        {companyLifecycle ? (
          <CompanyLifecycleDialog
            key={`${companyLifecycle.company.id}-${companyLifecycle.action}`}
            open
            companyName={companyLifecycle.company.nome}
            action={companyLifecycle.action}
            onClose={() => setCompanyLifecycle(null)}
            onConfirm={(observation) => alterarStatusEmpresa(companyLifecycle.company, companyLifecycle.action, observation)}
          />
        ) : null}
        {historyCollaborator ? (
          <CollaboratorHistoryDialog
            open
            collaboratorName={historyCollaborator.nome}
            items={(data.movimentacoes ?? [])
              .filter((item) => item.colaborador_id === historyCollaborator.id)
              .sort((a, b) => String(b.ocorrido_em).localeCompare(String(a.ocorrido_em)))}
            onClose={() => setHistoryCollaborator(null)}
          />
        ) : null}
      </section>
    </main>
  );

  async function createEmpresa(form: FormData) {
    await mutate(() => {
      const parsed = empresaSchema.parse(Object.fromEntries(form));
      return supabase.from("empresas").insert(parsed);
    }, "criar_empresa", "empresas");
  }

  async function createEmpresaHorario(form: FormData) {
    await mutate(() => {
      const parsed = empresaHorarioSchema.parse(Object.fromEntries(form));
      return supabase.from("empresa_horarios").upsert({ ...parsed, ativo: true }, { onConflict: "empresa_id,horario_entrada,horario_saida" });
    }, "criar_horario_empresa", "empresa_horarios");
  }

  async function saveWeeklySchedule(payload: ScheduleEditorPayload) {
    return mutate(() => supabase.rpc("dmr_salvar_jornada_semanal", {
      p_empresa_horario_id: payload.scheduleId,
      p_horario_entrada: payload.entrada,
      p_horario_saida: payload.saida,
      p_regras: payload.rules.map((rule) => ({
        dia_semana: rule.weekday,
        horario_entrada: rule.entrada,
        horario_saida: rule.saida,
        ativo: Boolean(rule.active),
      })),
    }));
  }

  async function saveScheduleException(payload: ScheduleExceptionPayload) {
    return mutate(() => supabase.rpc("dmr_salvar_excecao_jornada", {
      p_empresa_horario_id: payload.scheduleId,
      p_data: payload.date,
      p_horario_entrada: payload.entrada,
      p_horario_saida: payload.saida,
      p_motivo: payload.motivo || null,
    }));
  }

  async function createTurno(form: FormData): Promise<CreatedTurno | null> {
    setError("");
    try {
      const parsed = turnoSchema.parse(Object.fromEntries(form));
      const horario = (data.empresaHorarios ?? []).find((row) => row.id === parsed.empresa_horario_id);
      if (horario && horario.empresa_id !== parsed.empresa_id) throw new Error("Selecione uma entrada cadastrada para esta empresa.");
      if (!horario) throw new Error("Selecione uma entrada cadastrada para esta empresa.");
      const empresaId = horario.empresa_id;
      const turnoId = await ensureTurno({
        ...parsed,
        empresa_id: empresaId,
        horario_inicio: String(horario.horario_entrada).slice(0, 5),
        nome: nomeTurnoPorHorario(horario.horario_entrada, horario.horario_saida),
      });

      const { error: logError } = await supabase.rpc("dmr_log_action", {
        p_acao: "criar_turno",
        p_entidade: "turnos_empresa",
        p_entidade_id: turnoId,
        p_detalhes: { origem: "dashboard" },
      });
      if (logError) setError("O turno foi salvo, mas o log de auditoria não foi registrado.");

      await refreshAll();
      return {
        empresaId,
        horarioId: parsed.empresa_horario_id,
        turnoId,
      };
    } catch (err) {
      setError(toMessage(err));
      return null;
    }
  }

  async function ensureImportedTurno(input: EnsureImportedShiftInput): Promise<string> {
    const horario = (data.empresaHorarios ?? []).find(
      (row) => row.id === input.scheduleId && row.empresa_id === input.companyId && row.ativo !== false,
    );
    if (!horario) {
      throw new Error("A entrada selecionada não está mais ativa. Atualize os dados e tente novamente.");
    }

    const turnoId = await ensureTurno({
      empresa_id: input.companyId,
      empresa_horario_id: input.scheduleId,
      prioridade_envio: "normal",
      horario_inicio: String(horario.horario_entrada).slice(0, 5),
      nome: nomeTurnoPorHorario(horario.horario_entrada, horario.horario_saida),
    });

    const { error: logError } = await supabase.rpc("dmr_log_action", {
      p_acao: "criar_turno",
      p_entidade: "turnos_empresa",
      p_entidade_id: turnoId,
      p_detalhes: { origem: "importacao_lista" },
    });
    if (logError) setError("O turno foi criado automaticamente, mas o log de auditoria não foi registrado.");

    await refreshAll();
    return turnoId;
  }

  async function createColaborador(form: FormData): Promise<string | null> {
    let colaboradorId = "";
    const saved = await mutate(async () => {
      const parsed = colaboradorSchema.parse(Object.fromEntries(form));
      const telefoneNormalizado = normalizarTelefoneBrasil(parsed.telefone);
      colaboradorId = await ensureColaboradorVinculo(parsed.empresa_id, parsed.empresa_horario_id, parsed.nome, telefoneNormalizado);
      return { error: null };
    }, "criar_colaborador", "colaboradores");
    return saved ? colaboradorId : null;
  }

  async function createColaboradoresLote(form: FormData): Promise<string[]> {
    const colaboradorIds: string[] = [];
    const saved = await mutate(async () => {
      const parsed = colaboradoresLoteSchema.parse(Object.fromEntries(form));
      const lines = parseColaboradoresLote(parsed.lote);
      if (!lines.length) throw new Error("Informe pelo menos um colaborador no lote.");
      for (const line of lines) {
        colaboradorIds.push(await ensureColaboradorVinculo(parsed.empresa_id, parsed.empresa_horario_id, line.nome, line.telefone));
      }
      return { error: null };
    }, "criar_colaboradores_lote", "colaboradores");
    return saved ? colaboradorIds : [];
  }

  async function assertImportedPhoneAvailable(phone: string, collaboratorId?: string) {
    const normalizedPhone = normalizarTelefoneBrasil(phone);
    const candidates = telefonesEquivalentesBrasil(normalizedPhone);
    let query = supabase
      .from("colaboradores")
      .select("id")
      .in("telefone_normalizado", candidates)
      .limit(1);
    if (collaboratorId) query = query.neq("id", collaboratorId);
    const { data: existing, error: existingError } = await query.maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) throw new Error("Este telefone já pertence a outro colaborador.");
    return normalizedPhone;
  }

  async function linkImportedCollaborator(collaboratorId: string, scheduleId: string): Promise<string> {
    const { data: result, error: linkError } = await supabase.rpc("dmr_vincular_colaborador_existente", {
      p_colaborador_id: collaboratorId,
      p_destino_empresa_horario_id: scheduleId,
      p_observacao: "Vinculado pela importação assistida de lista.",
    });
    if (linkError) throw linkError;
    if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
      throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível vincular o colaborador.");
    }
    await refreshAll();
    return collaboratorId;
  }

  async function updateAndLinkImportedCollaborator(input: {
    collaboratorId: string;
    name: string;
    phone: string;
    scheduleId: string;
  }): Promise<string> {
    const name = input.name.trim();
    if (name.length < 2) throw new Error("Informe o nome completo do colaborador.");
    const normalizedPhone = await assertImportedPhoneAvailable(input.phone, input.collaboratorId);
    const { error: updateError } = await supabase
      .from("colaboradores")
      .update({ nome: name, telefone: normalizedPhone, ativo: true })
      .eq("id", input.collaboratorId);
    if (updateError) throw updateError;
    return linkImportedCollaborator(input.collaboratorId, input.scheduleId);
  }

  async function createAndLinkImportedCollaborator(input: {
    name: string;
    phone: string;
    scheduleId: string;
  }): Promise<string> {
    const name = input.name.trim();
    if (name.length < 2) throw new Error("Informe o nome completo do colaborador.");
    const normalizedPhone = await assertImportedPhoneAvailable(input.phone);
    const { data: created, error: createError } = await supabase
      .from("colaboradores")
      .insert({ nome: name, telefone: normalizedPhone, ativo: true })
      .select("id")
      .single();
    if (createError) throw createError;
    return linkImportedCollaborator(created.id, input.scheduleId);
  }

  async function gerarOperacaoManual(form: FormData) {
    setError("");
    try {
      const parsed = operacaoManualSchema.parse(Object.fromEntries(form));
      const turno = (data.turnos ?? []).find((row) => row.id === parsed.turno_empresa_id);
      if (turno && turno.empresa_id !== parsed.empresa_id) throw new Error("Selecione um turno válido para a empresa.");
      if (!turno) throw new Error("Selecione um turno válido para a empresa.");

      const colaboradorIds = form.getAll("colaborador_ids").map(String).filter(Boolean);
      if (!colaboradorIds.length) throw new Error("Carregue a equipe fixa e selecione pelo menos um colaborador.");
      validarHorarioDisparoFuturo({
        dataEscala: parsed.data,
        horarioInicioDisparo: parsed.horario_inicio_disparo,
      });

      const { data: result, error: rpcError } = await supabase.rpc("dmr_criar_operacao_com_equipe", {
        p_empresa_horario_id: turno.empresa_horario_id,
        p_data: parsed.data,
        p_horario_inicio_disparo: parsed.horario_inicio_disparo,
        p_prioridade: turno.prioridade_envio || "normal",
        p_colaborador_ids: colaboradorIds,
      });
      if (rpcError) throw rpcError;
      if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
        throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível adicionar a fila.");
      }

      setDate(parsed.data);
      await refreshAll(parsed.data);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }

  async function createContato(form: FormData) {
    await mutate(async () => {
      const parsed = contatoSchema.parse(Object.fromEntries(form));
      await ensureContatoAlerta(parsed.nome, parsed.telefone, parsed.notificar_de, parsed.notificar_ate);
      return { error: null };
    }, "criar_contato_alerta", "contatos_alerta_dmr");
  }

  async function saveConfig(chave: string, valor: Record<string, unknown>) {
    await mutate(() => supabase
      .from("configuracoes_sistema")
      .update({ valor })
      .eq("chave", chave), "editar_configuracao", "configuracoes_sistema", chave);
  }

  async function markTratado(id: string) {
    await mutate(() => supabase.from("escala_colaboradores").update({
      status_confirmacao: "tratado_manualmente",
      tratado_manualmente: true,
      tratado_em: new Date().toISOString(),
    }).eq("id", id), "marcar_tratado_manualmente", "escala_colaboradores", id);
  }

  async function apagarPainel(id: string) {
    await runDeleteRpc("dmr_apagar_painel_dia", id);
  }

  async function clearLogs() {
    setError("");
    try {
      const { error: clearError } = await supabase.rpc("dmr_limpar_logs_operacionais");
      if (clearError) throw clearError;
      await refreshAll();
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function updateRecord(table: string, id: string, values: Record<string, unknown>, action: string) {
    return mutate(() => supabase.from(table).update(values).eq("id", id), action, table, id);
  }

  function openLinkCollaborator(row: DashboardRow) {
    const destinations = (data.empresaHorarios ?? [])
      .filter((schedule) => {
        const company = (data.empresas ?? []).find((item) => item.id === schedule.empresa_id);
        return schedule.ativo !== false && company?.ativa !== false && !company?.contrato_encerrado_em;
      })
      .map((schedule) => [schedule.id, `${empresaNome(data.empresas ?? [], schedule.empresa_id)} - ${horarioLabel(schedule)}`] as [string, string])
      .sort((a, b) => compareNamesPtBr(a[1], b[1]));

    setEditDialog({
      title: "Vincular a empresa",
      description: `Selecione a equipe que receberá ${row.nome}. O contato permanente será preservado.`,
      fields: [
        { name: "empresa_horario_id", label: "Empresa e Entrada/Saída", value: destinations[0]?.[0] ?? "", options: destinations },
        { name: "observacao", label: "Observação (opcional)", value: "" },
      ],
      onSave: async (values) => {
        if (!values.empresa_horario_id) throw new Error("Cadastre uma jornada ativa antes de vincular o colaborador.");
        const { data: result, error: rpcError } = await supabase.rpc("dmr_vincular_colaborador_existente", {
          p_colaborador_id: row.id,
          p_destino_empresa_horario_id: values.empresa_horario_id,
          p_observacao: values.observacao || null,
        });
        if (rpcError) throw rpcError;
        if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
          throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível vincular o colaborador.");
        }
        await refreshAll();
        return true;
      },
    });
  }

  async function alterarStatusEmpresa(company: DashboardRow, action: CompanyLifecycleAction, observation: string) {
    setError("");
    const groupKey = empresaGrupoKey(company.nome);
    const targets = (data.empresas ?? []).filter((item) => {
      if (empresaGrupoKey(item.nome) !== groupKey) return false;
      if (action === "reativar") return item.ativa === false && !item.contrato_encerrado_em;
      if (action === "desativar") return item.ativa !== false && !item.contrato_encerrado_em;
      return !item.contrato_encerrado_em;
    });
    try {
      for (const target of targets) {
        const { data: result, error: rpcError } = await supabase.rpc("dmr_alterar_status_empresa", {
          p_empresa_id: target.id,
          p_acao: action,
          p_observacao: observation || null,
        });
        if (rpcError) throw rpcError;
        if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
          throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível alterar a situação da empresa.");
        }
      }
      await refreshAll();
      return true;
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  }

  async function removerColaboradorEquipe(vinculoId: string, observation: string) {
    setError("");
    try {
      const { data: result, error: rpcError } = await supabase.rpc("dmr_remover_colaborador_equipe", {
        p_vinculo_id: vinculoId,
        p_observacao: observation || null,
      });
      if (rpcError) throw rpcError;
      if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
        throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível remover o colaborador da equipe.");
      }
      await refreshAll();
      return true;
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  }

  async function reenviarMensagem(id: string) {
    setError("");
    try {
      const { data: result, error: rpcError } = await supabase.rpc("dmr_reenviar_pendente", {
        p_escala_colaborador_id: id,
      });
      if (rpcError) throw rpcError;
      if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
        throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível reenviar a mensagem.");
      }
      await refreshAll();
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function editHorarioDisparo(group: PainelGroup) {
    setEditDialog({
      title: "Editar horário de disparo",
      description: "A alteração será aplicada a todos os colaboradores desta operação. O primeiro envio ainda não pode ter começado.",
      fields: [
        { name: "horario_inicio_disparo", label: "Novo horário de disparo", type: "time", value: group.horarioDisparo },
      ],
      onSave: async (values) => {
        setError("");
        try {
          validarHorarioDisparoFuturo({
            dataEscala: group.data,
            horarioInicioDisparo: values.horario_inicio_disparo,
          });
          const { data: result, error: rpcError } = await supabase.rpc("dmr_editar_horario_disparo", {
            p_escala_id: group.escalaId,
            p_turno_empresa_id: group.turnoId,
            p_horario_inicio_disparo: values.horario_inicio_disparo,
          });
          if (rpcError) throw rpcError;
          if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
            throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível editar o horário de disparo.");
          }
          await refreshAll(group.data);
          return true;
        } catch (err) {
          setError(toMessage(err));
          return false;
        }
      },
    });
  }

  async function editSubstituto(row: DashboardRow) {
    setEditDialog({
      title: "Informar substituto",
      description: `A ausência de ${row.colaboradores?.nome ?? "colaborador"} será preservada. Deixe vazio para remover o substituto informado.`,
      fields: [
        { name: "substituto_nome", label: "Nome do colaborador substituto", value: row.substituto_nome ?? "" },
      ],
      onSave: async (values) => {
        setError("");
        try {
          const { data: result, error: rpcError } = await supabase.rpc("dmr_definir_substituto", {
            p_escala_colaborador_id: row.id,
            p_substituto_nome: values.substituto_nome,
          });
          if (rpcError) throw rpcError;
          if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
            throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível registrar o substituto.");
          }
          await refreshAll();
          return true;
        } catch (err) {
          const message = toMessage(err);
          setError(message);
          return message;
        }
      },
    });
  }

  async function runRelocation(state: RelocationState, destinationId: string): Promise<RelocationResult> {
    setError("");
    const response = state.mode === "permanent"
      ? await supabase.rpc("dmr_realocar_equipe_permanente", {
        p_vinculo_ids: state.selectedIds,
        p_destino_empresa_horario_id: destinationId,
      })
      : await supabase.rpc("dmr_realocar_equipe_data", {
        p_escala_colaborador_ids: state.selectedIds,
        p_destino_empresa_horario_id: destinationId,
      });
    const { data: result, error: rpcError } = response;
    if (rpcError) throw rpcError;
    const payload = result as { movidos?: number; ja_existentes?: number; houve_envio?: boolean } | null;
    await refreshAll();
    return {
      moved: Number(payload?.movidos ?? 0),
      alreadyThere: Number(payload?.ja_existentes ?? 0),
      hadSentMessages: Boolean(payload?.houve_envio),
    };
  }

  function prepareAnnouncementAfterRelocation(state: RelocationState, destinationId: string) {
    const movedRows = (data.painel ?? []).filter((row) => state.selectedIds.includes(row.id));
    const destination = (data.empresaHorarios ?? []).find((row) => row.id === destinationId);
    if (!movedRows.length || !destination) return;
    setAnnouncement({
      company: empresaNome(data.empresas ?? [], destination.empresa_id),
      schedule: horarioLabel(destination),
      scheduleId: destinationId,
      operationDate: movedRows[0].escalas?.data ?? date,
      rows: movedRows,
    });
    setRelocation(null);
  }

  async function createAnnouncement(payload: AnnouncementPayload) {
    setError("");
    try {
      const { data: result, error: rpcError } = await supabase.rpc("dmr_criar_comunicado", {
        p_empresa_horario_id: payload.scheduleId,
        p_assunto: payload.subject,
        p_corpo: payload.body,
        p_agendado_para: payload.scheduledAt,
        p_escala_colaborador_ids: payload.recipientIds,
      });
      if (rpcError) throw rpcError;
      if ((result as { sucesso?: boolean } | null)?.sucesso === false) {
        throw new Error("Não foi possível colocar o comunicado na fila.");
      }
      await refreshAll();
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }

  async function saveOperationTreatment(payload: OperationTreatmentPayload) {
    setError("");
    try {
      const { data: result, error: rpcError } = await supabase.rpc("dmr_tratar_falso_positivo", {
        p_escala_colaborador_id: payload.recordId,
        p_marcar: payload.markFalsePositive,
        p_motivo: payload.motivo || null,
        p_substituto_nome: payload.substitutoNome || null,
      });
      if (rpcError) throw rpcError;
      if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
        throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível salvar o tratamento.");
      }
      await refreshAll();
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }

  async function deleteContato(id: string) {
    await runDeleteRpc("dmr_apagar_contato_alerta", id);
  }

  async function deleteEmpresaHorario(id: string) {
    await runDeleteRpc("dmr_apagar_horario_empresa", id);
  }

  async function enviarRelatorioWhatsApp(dataRelatorio: string) {
    setError("");
    try {
      const { data: result, error: rpcError } = await supabase.rpc("dmr_enfileirar_relatorio_diario", {
        p_data: dataRelatorio,
      });
      if (rpcError) throw rpcError;
      if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
        throw new Error((result as { mensagem?: string }).mensagem ?? "Não foi possível enfileirar o relatório.");
      }
      await refreshAll();
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function runDeleteRpc(name: string, id: string) {
    setError("");
    try {
      const { error: deleteError } = await supabase.rpc(name, { p_id: id });
      if (deleteError) throw deleteError;
      await refreshAll();
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function editColaborador(row: DashboardRow) {
    setEditDialog({
      title: "Editar colaborador",
      fields: [
        { name: "nome", label: "Nome", value: row.nome ?? "" },
        { name: "telefone", label: "Telefone WhatsApp", type: "tel", value: row.telefone ?? "" },
      ],
      onSave: async (values) => {
        const telefoneNormalizado = normalizarTelefoneBrasil(values.telefone);
        return updateRecord("colaboradores", row.id ?? "", { nome: values.nome, telefone: telefoneNormalizado }, "editar_colaborador");
      },
    });
  }

  async function editEmpresa(row: DashboardRow) {
    const groupIds = empresaIdsDoGrupo(data.empresas ?? [], empresaGrupoKey(row.nome));
    setEditDialog({
      title: "Editar empresa",
      description: "Atualize o endereço usado nas mensagens enviadas aos colaboradores.",
      fields: [
        { name: "nome", label: "Nome", value: row.nome ?? "" },
        {
          name: "tipo_contratacao",
          label: "Tipo de contratação",
          value: row.tipo_contratacao ?? "",
          options: [["", "Selecione"], ["intermitente", "Contrato Intermitente"], ["freelancer", "Freelancer"]],
        },
        { name: "endereco", label: "Endereço", value: row.endereco ?? "" },
        { name: "numero", label: "Número", value: row.numero ?? "" },
        { name: "bairro", label: "Bairro", value: row.bairro ?? "" },
        { name: "cidade", label: "Cidade", value: row.cidade ?? "" },
      ],
      onSave: async (values) => {
        if (!values.tipo_contratacao) throw new Error("Selecione o tipo de contratação.");
        return mutate(() => supabase.from("empresas").update({
          nome: values.nome,
          tipo_contratacao: values.tipo_contratacao,
          endereco: values.endereco,
          numero: values.numero,
          bairro: values.bairro,
          cidade: values.cidade,
        }).in("id", groupIds.length ? groupIds : [row.id]), "editar_empresa", "empresas", row.id);
      },
    });
  }

  async function editContato(row: DashboardRow) {
    setEditDialog({
      title: "Editar contato de alerta",
      fields: [
        { name: "nome", label: "Nome do contato de alerta", value: row.nome ?? "" },
        { name: "telefone", label: "Telefone WhatsApp", type: "tel", value: row.telefone ?? "" },
        { name: "notificar_de", label: "Início dos alertas", type: "time", value: String(row.notificar_de ?? "00:00").slice(0, 5) },
        { name: "notificar_ate", label: "Fim dos alertas", type: "time", value: String(row.notificar_ate ?? "23:59").slice(0, 5) },
      ],
      onSave: async (values) => {
        const telefoneNormalizado = normalizarTelefoneBrasil(values.telefone);
        return updateRecord("contatos_alerta_dmr", row.id ?? "", {
          nome: values.nome,
          telefone: telefoneNormalizado,
          notificar_de: values.notificar_de,
          notificar_ate: values.notificar_ate,
        }, "editar_contato_alerta");
      },
    });
  }

  async function ensureTurno(parsed: z.infer<typeof turnoSchema> & { nome: string; horario_inicio: string }) {
    const existingByName = await findTurno(parsed.empresa_id, "nome", parsed.nome);
    const existingByTime = existingByName ? null : await findTurno(parsed.empresa_id, "horario_inicio", parsed.horario_inicio);
    const existing = existingByName ?? existingByTime;

    if (existing?.id) {
      const { error: updateError } = await supabase.from("turnos_empresa").update({
        nome: parsed.nome,
        empresa_horario_id: parsed.empresa_horario_id,
        horario_inicio: parsed.horario_inicio,
        prioridade_envio: parsed.prioridade_envio,
        ativo: true,
      }).eq("id", existing.id);
      if (updateError) throw updateError;
      return existing.id;
    }

    const { data: created, error: createError } = await supabase
      .from("turnos_empresa")
      .upsert({
        empresa_id: parsed.empresa_id,
        empresa_horario_id: parsed.empresa_horario_id,
        nome: parsed.nome,
        horario_inicio: parsed.horario_inicio,
        prioridade_envio: parsed.prioridade_envio,
        ativo: true,
      }, { onConflict: "empresa_id,nome" })
      .select("id")
      .single();
    if (createError) throw createError;
    return created.id;
  }

  async function findTurno(empresaId: string, column: "nome" | "horario_inicio", value: string) {
    const { data: row, error: findError } = await supabase
      .from("turnos_empresa")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    return row;
  }

  async function ensureColaboradorVinculo(empresaId: string, empresaHorarioId: string, nome: string, telefone: string) {
    const telefoneNormalizado = normalizarTelefoneBrasil(telefone);
    const phoneCandidates = telefonesEquivalentesBrasil(telefoneNormalizado);

    const { data: existing, error: existingError } = await supabase
      .from("colaboradores")
      .select("id")
      .in("telefone_normalizado", phoneCandidates)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    let colaboradorId = existing?.id;
    if (!colaboradorId) {
      const { data: created, error: createError } = await supabase
        .from("colaboradores")
        .insert({ nome, telefone: telefoneNormalizado, ativo: true })
        .select("id")
        .single();
      if (createError) throw createError;
      colaboradorId = created.id;
    } else {
      const { error: updateError } = await supabase.from("colaboradores").update({ nome, telefone: telefoneNormalizado, ativo: true }).eq("id", colaboradorId);
      if (updateError) throw updateError;
    }

    const { data: result, error: vinculoError } = await supabase.rpc("dmr_vincular_colaborador_existente", {
      p_colaborador_id: colaboradorId,
      p_destino_empresa_horario_id: empresaHorarioId,
      p_observacao: null,
    });
    if (vinculoError) throw vinculoError;
    if ((result as { sucesso?: boolean; mensagem?: string } | null)?.sucesso === false) {
      throw new Error((result as { mensagem?: string }).mensagem ?? `Não foi possível vincular o colaborador à empresa ${empresaId}.`);
    }
    return colaboradorId;
  }

  async function ensureContatoAlerta(nome: string, telefone: string, notificarDe: string, notificarAte: string) {
    const telefoneNormalizado = normalizarTelefoneBrasil(telefone);
    const phoneCandidates = telefonesEquivalentesBrasil(telefoneNormalizado);

    const { data: existing, error: existingError } = await supabase
      .from("contatos_alerta_dmr")
      .select("id")
      .in("telefone_normalizado", phoneCandidates)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      const { error: updateError } = await supabase.from("contatos_alerta_dmr").update({
        nome,
        telefone: telefoneNormalizado,
        notificar_de: notificarDe,
        notificar_ate: notificarAte,
        ativo: true,
      }).eq("id", existing.id);
      if (updateError) throw updateError;
      return;
    }

    const { error: createError } = await supabase.from("contatos_alerta_dmr").insert({
      nome,
      telefone: telefoneNormalizado,
      notificar_de: notificarDe,
      notificar_ate: notificarAte,
      ativo: true,
    });
    if (createError) throw createError;
  }

  async function mutate(action: () => PromiseLike<{ error: unknown }>, logAction?: string, entity?: string, entityId?: string) {
    setError("");
    try {
      const result = await action();
      if (result.error) {
        setError(toMessage(result.error));
        return false;
      }
      if (logAction && entity) {
        const { error: logError } = await supabase.rpc("dmr_log_action", {
          p_acao: logAction,
          p_entidade: entity,
          p_entidade_id: entityId ?? null,
          p_detalhes: { origem: "dashboard" },
        });
        if (logError) setError("A ação foi salva, mas o log de auditoria não foi registrado.");
      }
      await refreshAll();
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }
}

function Login({ error, onError }: { error: string; onError: (value: string) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (!email || !password) {
        onError("Preencha e-mail e senha.");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) onError(authError.message || "Não foi possível entrar. Confira e-mail e senha.");
    } catch (err) {
      onError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    setResetSent(false);
    setRecovering(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    try {
      if (!email) {
        onError("Informe o e-mail para receber o link de recuperação.");
        return;
      }

      const redirectTo = `${window.location.origin}/?reset=senha`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        onError(resetError.message || "Não foi possível enviar o e-mail de recuperação.");
        return;
      }
      setResetSent(true);
    } catch (err) {
      onError(toMessage(err));
    } finally {
      setRecovering(false);
    }
  }

  return (
    <main className="login">
      <section className="panel">
        <h1>DMR Confirmação de Presença</h1>
        <p className="status-line">Acesso administrativo</p>
        {error ? <p className="error">{error}</p> : null}
        {resetSent ? <p className="success">Enviamos um link para redefinir sua senha. Abra o e-mail mais recente e conclua pelo Dashboard.</p> : null}
        <form onSubmit={login} className="grid">
          <Input name="email" label="E-mail" type="email" autoComplete="email" required />
          <Input name="password" label="Senha" type="password" autoComplete="current-password" required />
          <button className="primary" type="submit" disabled={submitting}><Plus size={18} /> {submitting ? "Entrando..." : "Entrar"}</button>
        </form>
        <form onSubmit={requestPasswordReset} className="grid recovery-form">
          <Input name="email" label="Esqueci minha senha" type="email" autoComplete="email" placeholder="Digite seu e-mail para receber o link" required />
          <button type="submit" disabled={recovering}>{recovering ? "Enviando..." : "Enviar link de recuperação"}</button>
        </form>
      </section>
    </main>
  );
}

function PasswordRecovery({ error, onError, onDone }: {
  error: string;
  onError: (value: string) => void;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    setSuccess("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    try {
      if (password.length < 8) {
        onError("A nova senha precisa ter pelo menos 8 caracteres.");
        return;
      }
      if (password !== confirmation) {
        onError("As senhas digitadas não conferem.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        onError(updateError.message || "Não foi possível salvar a nova senha.");
        return;
      }
      window.history.replaceState({}, document.title, window.location.origin);
      setSuccess("Senha atualizada. Você já pode entrar com a nova senha.");
      await supabase.auth.signOut();
    } catch (err) {
      onError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <section className="panel">
        <h1>Redefinir senha</h1>
        <p className="status-line">Digite uma nova senha para acessar o Dashboard.</p>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <form onSubmit={updatePassword} className="grid">
          <Input name="password" label="Nova senha" type="password" autoComplete="new-password" required />
          <Input name="confirmation" label="Confirmar nova senha" type="password" autoComplete="new-password" required />
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar nova senha"}</button>
        </form>
        {success ? <button type="button" onClick={onDone}>Voltar para o login</button> : null}
      </section>
    </main>
  );
}

function MissingEnv() {
  return (
    <main className="login">
      <section className="panel">
        <h1>Configuração pendente</h1>
        <p>Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em `.env.local` para abrir o Dashboard.</p>
      </section>
    </main>
  );
}

function Empresas({ rows, empresaHorarios, weeklyRules, exceptions, onCreate, onCreateHorario, onDeleteHorario, onEdit, onLifecycle, onSaveWeekly, onSaveException }: {
  rows: DashboardRow[];
  empresaHorarios: DashboardRow[];
  weeklyRules: DashboardRow[];
  exceptions: DashboardRow[];
  onCreate: (form: FormData) => Promise<void>;
  onCreateHorario: (form: FormData) => Promise<void>;
  onDeleteHorario: (id: string) => Promise<void>;
  onEdit: (row: DashboardRow) => Promise<void>;
  onLifecycle: (row: DashboardRow, action: CompanyLifecycleAction) => void;
  onSaveWeekly: (payload: ScheduleEditorPayload) => Promise<boolean | void>;
  onSaveException: (payload: ScheduleExceptionPayload) => Promise<boolean | void>;
}) {
  async function submitEmpresa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(new FormData(event.currentTarget));
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Nova empresa</h2>
        <form onSubmit={submitEmpresa} className="form-grid">
          <Input name="nome" label="Nome" />
          <label>
            Tipo de contratação
            <select name="tipo_contratacao" required defaultValue="">
              <option value="" disabled>Selecione</option>
              <option value="intermitente">Contrato Intermitente</option>
              <option value="freelancer">Freelancer</option>
            </select>
          </label>
          <Input name="endereco" label="Endereço" />
          <Input name="numero" label="Número" />
          <Input name="bairro" label="Bairro" />
          <Input name="cidade" label="Cidade" />
          <Submit label="Criar empresa" />
        </form>
      </section>
      <EmpresaHorariosEditor empresas={rows} rows={empresaHorarios} weeklyRules={weeklyRules} exceptions={exceptions} onCreate={onCreateHorario} onDelete={onDeleteHorario} onEditEmpresa={onEdit} onLifecycle={onLifecycle} onSaveWeekly={onSaveWeekly} onSaveException={onSaveException} />
    </div>
  );
}

function EmpresaHorariosEditor({ empresas, rows, weeklyRules, exceptions, onCreate, onDelete, onEditEmpresa, onLifecycle, onSaveWeekly, onSaveException }: {
  empresas: DashboardRow[];
  rows: DashboardRow[];
  weeklyRules: DashboardRow[];
  exceptions: DashboardRow[];
  onCreate: (form: FormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditEmpresa: (row: DashboardRow) => Promise<void>;
  onLifecycle: (row: DashboardRow, action: CompanyLifecycleAction) => void;
  onSaveWeekly: (payload: ScheduleEditorPayload) => Promise<boolean | void>;
  onSaveException: (payload: ScheduleExceptionPayload) => Promise<boolean | void>;
}) {
  const empresaOptions = empresaOptionsAgrupadas(empresas);
  const managementOptions = empresaOptionsTodas(empresas);
  const [selectedEmpresa, setSelectedEmpresa] = useState(empresaOptions[0]?.[0] ?? "");
  const empresaAtual = empresaOptions.some(([id]) => id === selectedEmpresa) ? selectedEmpresa : (empresaOptions[0]?.[0] ?? "");
  const grupos = managementOptions.map(([grupoKey, nome]) => {
    const groupCompanies = empresas.filter((row) => empresaGrupoKey(row.nome) === grupoKey);
    const empresaIds = new Set(empresaIdsDoGrupoTodas(empresas, grupoKey));
    const empresa = empresaRepresentanteDoGrupoTodas(empresas, grupoKey);
    const horarios = rows
      .filter((row) => empresaIds.has(row.empresa_id) && row.ativo !== false)
      .sort((a, b) => String(a.horario_entrada ?? "").localeCompare(String(b.horario_entrada ?? "")));
    return { grupoKey, nome, empresa, empresas: groupCompanies, horarios };
  });

  async function submitHorario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(new FormData(event.currentTarget));
  }

  return (
    <section className="panel">
      <h2>Horários da empresa</h2>
      <form onSubmit={submitHorario} className="form-grid compact">
        <input type="hidden" name="empresa_id" value={empresaRepresentanteDoGrupo(empresas, empresaAtual)} />
        <label>
          Empresa
          <select value={empresaAtual} onChange={(event) => setSelectedEmpresa(event.currentTarget.value)}>
            {empresaOptions.map(([id, nome]) => <option key={`horario-empresa-${id}`} value={id}>{nome}</option>)}
          </select>
        </label>
        <Input name="horario_entrada" label="Entrada" type="time" />
        <Input name="horario_saida" label="Saída" type="time" />
        <Submit label="Adicionar horário" />
      </form>
      <div className="group-list">
        {grupos.length ? grupos.map((grupo) => (
          <EmpresaGrupoCard key={`empresa-grupo-${grupo.grupoKey}`} grupo={grupo} weeklyRules={weeklyRules} exceptions={exceptions} onEditEmpresa={onEditEmpresa} onLifecycle={onLifecycle} onDeleteHorario={onDelete} onSaveWeekly={onSaveWeekly} onSaveException={onSaveException} />
        )) : <p>Nenhuma empresa cadastrada.</p>}
      </div>
    </section>
  );
}

function EmpresaGrupoCard({ grupo, weeklyRules, exceptions, onEditEmpresa, onLifecycle, onDeleteHorario, onSaveWeekly, onSaveException }: {
  grupo: { grupoKey: string; nome: string; empresa?: DashboardRow; empresas: DashboardRow[]; horarios: DashboardRow[] };
  weeklyRules: DashboardRow[];
  exceptions: DashboardRow[];
  onEditEmpresa: (row: DashboardRow) => Promise<void>;
  onLifecycle: (row: DashboardRow, action: CompanyLifecycleAction) => void;
  onDeleteHorario: (id: string) => Promise<void>;
  onSaveWeekly: (payload: ScheduleEditorPayload) => Promise<boolean | void>;
  onSaveException: (payload: ScheduleExceptionPayload) => Promise<boolean | void>;
}) {
  const empresa = grupo.empresa;
  const endereco = empresa ? [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade].filter(Boolean).join(", ") : "Dados não cadastrados.";
  const [editingSchedule, setEditingSchedule] = useState<DashboardRow | null>(null);
  const [exceptionSchedule, setExceptionSchedule] = useState<DashboardRow | null>(null);
  const contractEnded = grupo.empresas.length > 0 && grupo.empresas.every((item) => Boolean(item.contrato_encerrado_em));
  const active = grupo.empresas.some((item) => item.ativa !== false && !item.contrato_encerrado_em);

  function editorRules(scheduleId: string): ScheduleRuleInput[] {
    return weeklyRules
      .filter((rule) => rule.empresa_horario_id === scheduleId)
      .map((rule) => ({
        weekday: Number(rule.dia_semana),
        entrada: String(rule.horario_entrada ?? "").slice(0, 5),
        saida: String(rule.horario_saida ?? "").slice(0, 5),
        active: rule.ativo !== false,
      }));
  }

  function scheduleData(row: DashboardRow) {
    return {
      id: String(row.id),
      entrada: String(row.horario_entrada ?? "").slice(0, 5),
      saida: String(row.horario_saida ?? "").slice(0, 5),
    };
  }

  return (
    <>
      <details className="group-card">
        <summary>
          <span>
            <strong>{grupo.nome}</strong>
            <small>{grupo.horarios.length} Horários cadastrados</small>
          </span>
          <Badge value={contractEnded ? "contrato_encerrado" : active ? "ativo" : "inativo"} />
        </summary>
        <div className="group-body">
          <div className="record-details">
            <div><span>Endereço</span><strong>{endereco || "Dados não cadastrados."}</strong></div>
            <div><span>Tipo de contratação</span><strong>{contractTypeLabel(empresa?.tipo_contratacao)}</strong></div>
            {empresa ? (
              <div className="actions">
                <button type="button" onClick={() => void onEditEmpresa(empresa)}>Editar empresa</button>
                {!contractEnded ? (
                  <button type="button" onClick={() => onLifecycle(empresa, active ? "desativar" : "reativar")}>{active ? "Desativar" : "Reativar"}</button>
                ) : null}
                {!contractEnded ? <button type="button" className="danger" onClick={() => onLifecycle(empresa, "encerrar_contrato")}>Encerrar contrato</button> : null}
              </div>
            ) : null}
          </div>
          <div className="table-wrap inner-table">
            <table>
              <thead><tr><th>Jornada</th><th>Ações</th></tr></thead>
              <tbody>
                {grupo.horarios.length ? grupo.horarios.map((row) => {
                  const futureExceptions = exceptions.filter((item) => item.empresa_horario_id === row.id && item.ativo !== false && String(item.data) >= today()).length;
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="schedule-row-main">
                          <strong>{horarioLabel(row)}</strong>
                          <small>{futureExceptions ? `${futureExceptions} exceção(ões) futura(s)` : "Sem exceções futuras"}</small>
                        </div>
                      </td>
                      <td>
                        <div className="actions">
                          <button type="button" onClick={() => setEditingSchedule(row)}>Editar jornada</button>
                          <button type="button" onClick={() => setExceptionSchedule(row)}>Adicionar exceção</button>
                          <button type="button" className="danger" onClick={() => void onDeleteHorario(row.id)}>Apagar</button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={2}>Nenhum horário cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      {editingSchedule ? (
        <ScheduleEditor
          open
          companyName={grupo.nome}
          schedule={scheduleData(editingSchedule)}
          rules={editorRules(String(editingSchedule.id))}
          onClose={() => setEditingSchedule(null)}
          onSave={onSaveWeekly}
        />
      ) : null}
      {exceptionSchedule ? (
        <ScheduleExceptionDialog
          open
          companyName={grupo.nome}
          schedule={scheduleData(exceptionSchedule)}
          minDate={today()}
          onClose={() => setExceptionSchedule(null)}
          onSave={onSaveException}
        />
      ) : null}
    </>
  );
}

function Turnos({ rows, filaRows, empresas, empresaHorarios, colaboradores, vinculos, onCreate, onEnsureImportedShift, onCreateFila, onCreateColaborador, onCreateBatch, onLinkImported, onUpdateAndLinkImported, onCreateAndLinkImported }: {
  rows: DashboardRow[];
  filaRows: DashboardRow[];
  empresas: DashboardRow[];
  empresaHorarios: DashboardRow[];
  colaboradores: DashboardRow[];
  vinculos: DashboardRow[];
  onCreate: (form: FormData) => Promise<CreatedTurno | null>;
  onEnsureImportedShift: (input: EnsureImportedShiftInput) => Promise<string>;
  onCreateFila: (form: FormData) => Promise<boolean>;
  onCreateColaborador: (form: FormData) => Promise<string | null>;
  onCreateBatch: (form: FormData) => Promise<string[]>;
  onLinkImported: (collaboratorId: string, scheduleId: string) => Promise<string>;
  onUpdateAndLinkImported: (input: {
    collaboratorId: string;
    name: string;
    phone: string;
    scheduleId: string;
  }) => Promise<string>;
  onCreateAndLinkImported: (input: {
    name: string;
    phone: string;
    scheduleId: string;
  }) => Promise<string>;
}) {
  const empresasUnicas = useMemo(() => empresaOptionsAgrupadas(empresas), [empresas]);
  const turnosOrdenadosPorHorario = useMemo(() => {
    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    return [...rows].sort((a, b) => {
      const aNext = minutesUntilNextStart(a.horario_inicio, minutesNow);
      const bNext = minutesUntilNextStart(b.horario_inicio, minutesNow);
      return aNext - bNext || compareNamesPtBr(empresaNome(empresas, a.empresa_id), empresaNome(empresas, b.empresa_id));
    });
  }, [rows, empresas]);
  const filasOrdenadasPorDisparo = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of filaRows) {
      const empresa = row.escalas?.empresas?.nome ?? "-";
      const entrada = String(row.horario_inicio ?? "").slice(0, 5);
      const saida = String(row.turnos_empresa?.empresa_horarios?.horario_saida ?? "").slice(0, 5);
      const prioridade = row.turnos_empresa?.prioridade_envio || "normal";
      const horarioDisparo = String(row.horario_inicio_disparo ?? "").slice(0, 5);
      const key = [row.escalas?.id, row.turnos_empresa?.id, horarioDisparo].join(":");
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          empresa,
          "entrada/saída": saida ? `${entrada} as ${saida}` : entrada,
          "data da operação": formatDateBrazil(row.escalas?.data),
          prioridade_envio: prioridade,
          "horário de disparo": horarioDisparo,
          acoes: "Fila adicionada",
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      const byDisparo = String(a["horário de disparo"]).localeCompare(String(b["horário de disparo"]));
      if (byDisparo) return byDisparo;
      return compareNamesPtBr(a.empresa, b.empresa);
    });
  }, [filaRows]);
  const [selectedEmpresa, setSelectedEmpresa] = useState(empresasUnicas[0]?.[0] ?? "");
  const [selectedTurno, setSelectedTurno] = useState("");
  const [selectedEmpresaTurno, setSelectedEmpresaTurno] = useState(empresasUnicas[0]?.[0] ?? "");
  const [selectedHorarioTurno, setSelectedHorarioTurno] = useState("");
  const [operationDate, setOperationDate] = useState(today());
  const [horarioDisparo, setHorarioDisparo] = useState("");
  const [equipeCarregada, setEquipeCarregada] = useState(false);
  const [colaboradoresSelecionados, setColaboradoresSelecionados] = useState<string[]>([]);
  const [colaboradorExtra, setColaboradorExtra] = useState("");
  const [filaAviso, setFilaAviso] = useState("");
  const empresaFilaAtual = empresasUnicas.some(([id]) => id === selectedEmpresa) ? selectedEmpresa : (empresasUnicas[0]?.[0] ?? "");
  const empresaTurnoAtual = empresasUnicas.some(([id]) => id === selectedEmpresaTurno) ? selectedEmpresaTurno : (empresasUnicas[0]?.[0] ?? "");
  const turnosDaEmpresa = turnosPorGrupo(turnosOrdenadosPorHorario, empresas, empresaFilaAtual);
  const horariosDoTurno = horarioOptionsPorGrupo(empresas, empresaHorarios, empresaTurnoAtual);
  const turnoFilaAtual = turnosDaEmpresa.some((turno) => turno.id === selectedTurno) ? selectedTurno : (turnosDaEmpresa[0]?.id ?? "");
  const horarioTurnoAtual = horariosDoTurno.some(([id]) => id === selectedHorarioTurno) ? selectedHorarioTurno : (horariosDoTurno[0]?.[0] ?? "");
  const turnoSelecionado = rows.find((row) => row.id === turnoFilaAtual);
  const equipeFixa = sortByName(vinculos
    .filter((vinculo) =>
      vinculo.empresa_id === turnoSelecionado?.empresa_id &&
      vinculo.empresa_horario_id === turnoSelecionado?.empresa_horario_id &&
      vinculo.ativo !== false
    )
    .map((vinculo) => colaboradores.find((colaborador) => colaborador.id === vinculo.colaborador_id && colaborador.ativo !== false))
    .filter((colaborador): colaborador is DashboardRow => Boolean(colaborador)), (colaborador) => colaborador.nome);
  const colaboradoresDisponiveis = sortByName(
    colaboradores.filter((colaborador) => colaborador.ativo !== false && !colaboradoresSelecionados.includes(colaborador.id)),
    (colaborador) => colaborador.nome,
  );

  function resetEquipe() {
    setEquipeCarregada(false);
    setColaboradoresSelecionados([]);
    setColaboradorExtra("");
    setFilaAviso("");
  }

  function carregarEquipeFixa() {
    setColaboradoresSelecionados(equipeFixa.map((colaborador) => colaborador.id));
    setEquipeCarregada(true);
    setFilaAviso(equipeFixa.length ? "" : "Nenhum colaborador fixo vinculado a esta entrada/saída.");
  }

  async function reaproveitarUltimaLista() {
    if (!turnoSelecionado?.empresa_horario_id) {
      setFilaAviso("Selecione uma empresa e uma entrada/saída antes de reaproveitar a lista.");
      return;
    }

    setFilaAviso("");
    const { data: ultimaEquipe, error } = await supabase.rpc("dmr_obter_ultima_equipe_operacao", {
      p_empresa_horario_id: turnoSelecionado.empresa_horario_id,
      p_antes_de: operationDate,
    });
    if (error) {
      setFilaAviso(toMessage(error));
      return;
    }

    const idsVinculados = new Set(equipeFixa.map((colaborador) => String(colaborador.id)));
    const ids = ((ultimaEquipe ?? []) as { colaborador_id?: string }[])
      .map((item) => String(item.colaborador_id ?? ""))
      .filter((id) => id && idsVinculados.has(id));

    setColaboradoresSelecionados([...new Set(ids)]);
    setEquipeCarregada(true);
    if (!ids.length) setFilaAviso("Nenhuma lista anterior válida foi encontrada para esta empresa e entrada/saída.");
  }

  function toggleColaborador(id: string) {
    setColaboradoresSelecionados((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function desmarcarTodos() {
    setColaboradoresSelecionados([]);
    setColaboradorExtra("");
    setEquipeCarregada(true);
    setFilaAviso("");
  }

  function adicionarSomenteHoje() {
    if (!colaboradorExtra) return;
    setColaboradoresSelecionados((current) => current.includes(colaboradorExtra) ? current : [...current, colaboradorExtra]);
    setColaboradorExtra("");
    setEquipeCarregada(true);
    setFilaAviso("");
  }

  function applyImportedTeam(input: AppliedShiftListImport) {
    setSelectedEmpresa(empresaGrupoKeyPorId(empresas, input.companyId));
    setSelectedTurno(input.shiftId);
    setOperationDate(input.operationDate);
    setHorarioDisparo(input.dispatchTime);
    setColaboradoresSelecionados(input.collaboratorIds);
    setEquipeCarregada(true);
    setColaboradorExtra("");
    setFilaAviso("");
  }

  async function handleCreateTurno(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await onCreate(new FormData(event.currentTarget));
    if (!created) return;
    setSelectedEmpresa(empresaGrupoKeyPorId(empresas, created.empresaId));
    setSelectedEmpresaTurno(empresaGrupoKeyPorId(empresas, created.empresaId));
    setSelectedTurno(created.turnoId);
    setSelectedHorarioTurno(created.horarioId);
    resetEquipe();
  }

  async function handleCreateFila(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let ids = colaboradoresSelecionados;
    if (!equipeCarregada) {
      ids = equipeFixa.map((colaborador) => colaborador.id);
      setColaboradoresSelecionados(ids);
      setEquipeCarregada(true);
    }
    if (!ids.length) {
      setFilaAviso("Nenhum colaborador selecionado. Cadastre colaboradores nesta empresa/entrada ou adicione alguém somente hoje.");
      return;
    }
    setFilaAviso("");
    form.delete("colaborador_ids");
    ids.forEach((id) => form.append("colaborador_ids", id));
    const success = await onCreateFila(form);
    if (!success) return;
    setSelectedEmpresa(empresaGrupoKeyPorId(empresas, empresaIdDoTurno(rows, String(form.get("turno_empresa_id") ?? ""))));
    setSelectedTurno(String(form.get("turno_empresa_id") ?? ""));
    setOperationDate(String(form.get("data") ?? today()));
    setHorarioDisparo(String(form.get("horario_inicio_disparo") ?? ""));
  }

  async function handleCreateColaborador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const colaboradorId = await onCreateColaborador(new FormData(formElement));
    if (!colaboradorId) return;
    setColaboradoresSelecionados((current) => current.includes(colaboradorId) ? current : [...current, colaboradorId]);
    setEquipeCarregada(true);
    setFilaAviso("");
    formElement.reset();
  }

  async function handleCreateBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const colaboradorIds = await onCreateBatch(new FormData(formElement));
    if (!colaboradorIds.length) return;
    setColaboradoresSelecionados((current) => [...new Set([...current, ...colaboradorIds])]);
    setEquipeCarregada(true);
    setFilaAviso("");
    formElement.reset();
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Novo turno</h2>
        <form onSubmit={handleCreateTurno} className="form-grid">
          <input type="hidden" name="empresa_id" value={empresaIdDoHorario(empresaHorarios, horarioTurnoAtual)} />
          <label>
            Empresa
            <select value={empresaTurnoAtual} onChange={(event) => { setSelectedEmpresaTurno(event.currentTarget.value); setSelectedHorarioTurno(""); resetEquipe(); }}>
              {empresasUnicas.map(([id, nome]) => <option key={`turno-empresa-${id}`} value={id}>{nome}</option>)}
            </select>
          </label>
          <label>
            Entrada/Saída
            <select name="empresa_horario_id" value={horarioTurnoAtual} onChange={(event) => { setSelectedHorarioTurno(event.currentTarget.value); resetEquipe(); }}>
              {horariosDoTurno.map(([id, label]) => <option key={`turno-horario-${id}`} value={id}>{label}</option>)}
            </select>
          </label>
          <Select name="prioridade_envio" label="Prioridade" options={[["normal", "Normal"], ["alta", "Alta"]]} />
          <Submit label="Criar turno" />
        </form>
      </section>
      <section className="panel">
        <h2>Adicionar fila</h2>
        <form onSubmit={handleCreateFila} className="form-grid">
          <input type="hidden" name="empresa_id" value={empresaIdDoTurno(rows, turnoFilaAtual)} />
          <label>
            Empresa
            <select value={empresaFilaAtual} onChange={(event) => { setSelectedEmpresa(event.currentTarget.value); setSelectedTurno(""); resetEquipe(); }}>
              {empresasUnicas.map(([id, nome]) => <option key={`fila-empresa-${id}`} value={id}>{nome}</option>)}
            </select>
          </label>
          <label>
            Entrada/Saída
            <select name="turno_empresa_id" value={turnoFilaAtual} onChange={(event) => { setSelectedTurno(event.currentTarget.value); resetEquipe(); }}>
              {turnosDaEmpresa.map((turno) => <option key={`fila-turno-${turno.id}`} value={turno.id}>{turnoLabel(turno, empresaHorarios)}</option>)}
            </select>
          </label>
          <Input name="data" label="Data da Operação (DD/MM/AAAA)" type="date" value={operationDate} onChange={(event) => { setOperationDate(event.currentTarget.value); resetEquipe(); }} />
          <Input name="horario_inicio_disparo" label="Horário de Disparo" type="time" value={horarioDisparo} onChange={(event) => { setHorarioDisparo(event.currentTarget.value); resetEquipe(); }} />
          {colaboradoresSelecionados.map((id) => <input key={`colaborador-selecionado-${id}`} type="hidden" name="colaborador_ids" value={id} />)}
          <button type="button" onClick={carregarEquipeFixa}>Carregar equipe fixa</button>
          <button type="button" onClick={() => void reaproveitarUltimaLista()}>Reaproveitar última lista</button>
          <button className="primary" type="submit"><Plus size={18} /> Adicionar fila</button>
        </form>
        {filaAviso ? <p className="error">{filaAviso}</p> : null}
        <ShiftListImportPanel
          companies={empresas}
          schedules={empresaHorarios}
          shifts={rows}
          preferredScheduleId={horarioTurnoAtual}
          preferredShiftId={turnoFilaAtual}
          collaborators={colaboradores}
          links={vinculos}
          selectedCollaboratorIds={colaboradoresSelecionados}
          onEnsureShift={onEnsureImportedShift}
          onLinkExisting={onLinkImported}
          onUpdateAndLink={onUpdateAndLinkImported}
          onCreateAndLink={onCreateAndLinkImported}
          onApply={applyImportedTeam}
        />
        {equipeCarregada ? (
          <div className="team-review">
            <div className="team-review-header">
              <div>
                <h3>Equipe do dia</h3>
                <p className="status-line">{colaboradoresSelecionados.length} colaboradores selecionados</p>
              </div>
              <button type="button" onClick={desmarcarTodos} disabled={colaboradoresSelecionados.length === 0}>Desmarcar todos</button>
            </div>
            <div className="team-list">
              {equipeFixa.map((colaborador) => (
                <label className="team-member" key={`equipe-dia-${colaborador.id}`}>
                  <input
                    type="checkbox"
                    checked={colaboradoresSelecionados.includes(colaborador.id)}
                    onChange={() => toggleColaborador(colaborador.id)}
                  />
                  <span>{colaborador.nome}</span>
                  <small>{maskPhone(colaborador.telefone)}</small>
                </label>
              ))}
              {!equipeFixa.length ? <p className="status-line">Nenhum colaborador fixo vinculado a esta entrada/saída.</p> : null}
            </div>
            <div className="inline-actions">
              <label>
                Adicionar somente hoje
                <select value={colaboradorExtra} onChange={(event) => setColaboradorExtra(event.currentTarget.value)}>
                  <option value="">Selecione</option>
                  {colaboradoresDisponiveis.map((colaborador) => <option key={`extra-${colaborador.id}`} value={colaborador.id}>{colaborador.nome}</option>)}
                </select>
              </label>
              <button type="button" onClick={adicionarSomenteHoje} disabled={!colaboradorExtra}>Adicionar somente hoje</button>
            </div>
          </div>
        ) : null}
        {turnoSelecionado ? (
          <details className="quick-team-entry">
            <summary>Adicionar colaboradores nesta equipe</summary>
            <div className="quick-team-entry-body">
              <form className="form-grid" onSubmit={handleCreateColaborador}>
                <input type="hidden" name="empresa_id" value={turnoSelecionado.empresa_id} />
                <input type="hidden" name="empresa_horario_id" value={turnoSelecionado.empresa_horario_id} />
                <Input name="nome" label="Nome" />
                <Input name="telefone" label="Telefone WhatsApp" />
                <Submit label="Adicionar colaborador" />
              </form>
              <form className="grid quick-batch-form" onSubmit={handleCreateBatch}>
                <input type="hidden" name="empresa_id" value={turnoSelecionado.empresa_id} />
                <input type="hidden" name="empresa_horario_id" value={turnoSelecionado.empresa_horario_id} />
                <label>
                  Adicionar em lote
                  <textarea name="lote" rows={4} placeholder="" />
                </label>
                <Submit label="Adicionar lote" />
              </form>
            </div>
          </details>
        ) : null}
      </section>
      <SimpleTable rows={filasOrdenadasPorDisparo} columns={["empresa", "entrada/saída", "data da operação", "prioridade_envio", "horário de disparo", "acoes"]} />
    </div>
  );
}

function BancoColaboradores({ rows, empresas, empresaHorarios, vinculos, onEdit, onViewHistory, onLink }: {
  rows: DashboardRow[];
  empresas: DashboardRow[];
  empresaHorarios: DashboardRow[];
  vinculos: DashboardRow[];
  onEdit: (row: DashboardRow) => Promise<void>;
  onViewHistory: (row: DashboardRow) => void;
  onLink: (row: DashboardRow) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredRows = filterCollaborators(rows, query);
  const activeMemberships = vinculos.filter((item) => item.ativo !== false);

  return (
    <div className="grid">
      <section className="panel directory-header">
        <div>
          <h2>Banco de colaboradores</h2>
          <p className="status-line">Cadastro permanente para consultar, editar e reutilizar contatos sem recadastrá-los.</p>
        </div>
        <label className="directory-search">
          Pesquisar por nome ou telefone
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Digite um nome ou número" />
        </label>
      </section>
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>Equipes atuais</th><th>Ações</th></tr></thead>
          <tbody>
            {filteredRows.length ? filteredRows.map((row) => {
              const memberships = activeMemberships.filter((item) => item.colaborador_id === row.id);
              const teamLabels = memberships.map((item) => {
                const schedule = empresaHorarios.find((candidate) => candidate.id === item.empresa_horario_id);
                return `${empresaNome(empresas, item.empresa_id)}${schedule ? ` - ${horarioLabel(schedule)}` : ""}`;
              }).sort(compareNamesPtBr);
              return (
                <tr key={`directory-${row.id}`}>
                  <td><strong>{row.nome}</strong></td>
                  <td>{maskPhone(row.telefone)}</td>
                  <td>{teamLabels.length ? teamLabels.join("; ") : "Sem empresa no momento"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" onClick={() => void onEdit(row)}>Editar contato</button>
                      <button type="button" onClick={() => onViewHistory(row)}>Ver histórico</button>
                      <button type="button" className="primary" onClick={() => onLink(row)}>Vincular a empresa</button>
                    </div>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={4}>Nenhum colaborador encontrado.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Colaboradores({ rows, empresas, empresaHorarios, vinculos, onCreate, onCreateBatch, onEdit, onRequestRemove, onRelocate }: {
  rows: DashboardRow[];
  empresas: DashboardRow[];
  empresaHorarios: DashboardRow[];
  vinculos: DashboardRow[];
  onCreate: (form: FormData) => Promise<string | null>;
  onCreateBatch: (form: FormData) => Promise<string[]>;
  onEdit: (row: DashboardRow) => Promise<void>;
  onRequestRemove: (state: TeamRemovalState) => void;
  onRelocate: (selectedIds: string[], origin: string, currentScheduleId?: string) => void;
}) {
  const empresaOptions = empresaOptionsAgrupadas(empresas);
  const [selectedEmpresa, setSelectedEmpresa] = useState(empresaOptions[0]?.[0] ?? "");
  const [selectedEmpresaLote, setSelectedEmpresaLote] = useState(empresaOptions[0]?.[0] ?? "");
  const [selectedHorario, setSelectedHorario] = useState("");
  const [selectedHorarioLote, setSelectedHorarioLote] = useState("");
  const [selectedVinculos, setSelectedVinculos] = useState<string[]>([]);
  const empresaAtual = empresaOptions.some(([id]) => id === selectedEmpresa) ? selectedEmpresa : (empresaOptions[0]?.[0] ?? "");
  const empresaLoteAtual = empresaOptions.some(([id]) => id === selectedEmpresaLote) ? selectedEmpresaLote : (empresaOptions[0]?.[0] ?? "");
  const horariosAtual = horarioOptionsPorGrupo(empresas, empresaHorarios, empresaAtual);
  const horariosLoteAtual = horarioOptionsPorGrupo(empresas, empresaHorarios, empresaLoteAtual);
  const horarioAtual = horariosAtual.some(([id]) => id === selectedHorario) ? selectedHorario : (horariosAtual[0]?.[0] ?? "");
  const horarioLoteAtual = horariosLoteAtual.some(([id]) => id === selectedHorarioLote) ? selectedHorarioLote : (horariosLoteAtual[0]?.[0] ?? "");
  const rowsWithEmpresa = vinculos
    .filter((vinculo) => vinculo.ativo !== false)
    .map((vinculo) => {
      const colaborador = rows.find((row) => row.id === vinculo.colaborador_id);
      const horario = empresaHorarios.find((item) => item.id === vinculo.empresa_horario_id);
      return {
        id: vinculo.id,
        empresa: empresaNome(empresas, vinculo.empresa_id),
        grupoKey: empresaGrupoKeyPorId(empresas, vinculo.empresa_id),
        "entrada/saída": horario ? horarioLabel(horario) : "sem Entrada/Saída",
        nome: colaborador?.nome ?? "-",
        telefone: maskPhone(colaborador?.telefone),
        scheduleId: vinculo.empresa_horario_id,
        acoes: colaborador ? (
          <div className="actions">
            <button type="button" onClick={() => void onEdit(colaborador)}>Editar</button>
            <button type="button" className="danger" onClick={() => onRequestRemove({
              vinculoId: vinculo.id,
              collaboratorName: colaborador.nome,
              companyName: empresaNome(empresas, vinculo.empresa_id),
            })}>Remover da empresa</button>
          </div>
        ) : "-",
      };
    });
  const gruposColaboradores = empresaOptions
    .map(([grupoKey, nome]) => ({
      grupoKey,
      nome,
      rows: rowsWithEmpresa
        .filter((row) => row.grupoKey === grupoKey)
        .sort(compareCompanyScheduleNameRows),
    }))
    .filter((grupo) => grupo.rows.length);

  async function submitColaborador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(new FormData(event.currentTarget));
  }

  async function submitColaboradoresLote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateBatch(new FormData(event.currentTarget));
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Equipes por empresa</h2>
        <p className="status-line">Cadastre pessoas diretamente em uma jornada ou gerencie os vínculos atuais.</p>
      </section>
      <section className="panel">
        <h2>Novo colaborador</h2>
        <form onSubmit={submitColaborador} className="form-grid">
          <input type="hidden" name="empresa_id" value={empresaIdDoHorario(empresaHorarios, horarioAtual)} />
          <label>
            Empresa
            <select value={empresaAtual} onChange={(event) => { setSelectedEmpresa(event.currentTarget.value); setSelectedHorario(""); }}>
              {empresaOptions.map(([id, nome]) => <option key={`colaborador-empresa-${id}`} value={id}>{nome}</option>)}
            </select>
          </label>
          <label>
            Entrada/Saída
            <select name="empresa_horario_id" value={horarioAtual} onChange={(event) => setSelectedHorario(event.currentTarget.value)}>
              {horariosAtual.map(([id, label]) => <option key={`colaborador-horario-${id}`} value={id}>{label}</option>)}
            </select>
          </label>
          <Input name="nome" label="Nome" />
          <Input name="telefone" label="Telefone WhatsApp" />
          <Submit label="Criar colaborador" />
        </form>
      </section>
      <section className="panel">
        <h2>Colaboradores em lote</h2>
        <form onSubmit={submitColaboradoresLote} className="grid">
          <input type="hidden" name="empresa_id" value={empresaIdDoHorario(empresaHorarios, horarioLoteAtual)} />
          <label>
            Empresa
            <select value={empresaLoteAtual} onChange={(event) => { setSelectedEmpresaLote(event.currentTarget.value); setSelectedHorarioLote(""); }}>
              {empresaOptions.map(([id, nome]) => <option key={`lote-empresa-${id}`} value={id}>{nome}</option>)}
            </select>
          </label>
          <label>
            Entrada/Saída
            <select name="empresa_horario_id" value={horarioLoteAtual} onChange={(event) => setSelectedHorarioLote(event.currentTarget.value)}>
              {horariosLoteAtual.map(([id, label]) => <option key={`lote-horario-${id}`} value={id}>{label}</option>)}
            </select>
          </label>
          <label>Lista de colaboradores<textarea name="lote" rows={6} placeholder="" /></label>
          <Submit label="Criar lote" />
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading-actions">
          <div><h2>Colaboradores cadastrados nas empresas</h2><p className="status-line">Selecione um ou mais nomes para realocar sem recadastrar.</p></div>
          <button
            type="button"
            disabled={!selectedVinculos.length}
            onClick={() => {
              const selectedRows = rowsWithEmpresa.filter((item) => selectedVinculos.includes(item.id));
              const scheduleIds = [...new Set(selectedRows.map((item) => String(item.scheduleId ?? "")).filter(Boolean))];
              const origin = scheduleIds.length === 1
                ? `${selectedRows[0]?.empresa ?? "Empresa"} - ${selectedRows[0]?.["entrada/saída"] ?? "Jornada não informada"}`
                : `${scheduleIds.length} jornadas selecionadas`;
              onRelocate(selectedVinculos, origin, scheduleIds.length === 1 ? scheduleIds[0] : undefined);
            }}
          >Realocar selecionados</button>
        </div>
        <div className="group-list">
          {gruposColaboradores.length ? gruposColaboradores.map((grupo) => (
            <ColaboradorEmpresaGrupo
              key={`colaborador-grupo-${grupo.grupoKey}`}
              grupo={grupo}
              selectedIds={selectedVinculos}
              onToggle={(id, checked) => setSelectedVinculos((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))}
            />
          )) : <p>Nenhum registro encontrado.</p>}
        </div>
      </section>
    </div>
  );
}

function ColaboradorEmpresaGrupo({ grupo, selectedIds, onToggle }: {
  grupo: { grupoKey: string; nome: string; rows: Record<string, unknown>[] };
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <details className="group-card">
      <summary>
        <span>
          <strong>{grupo.nome}</strong>
          <small>{grupo.rows.length} Colaboradores cadastrados</small>
        </span>
      </summary>
      <div className="group-body">
        <div className="table-wrap inner-table">
          <table>
            <thead><tr><th aria-label="Selecionar"></th><th>Entrada/Saída</th><th>Nome</th><th>Telefone</th><th>Ações</th></tr></thead>
            <tbody>
              {grupo.rows.map((row) => (
                <tr key={String(row.id)}>
                  <td><input type="checkbox" aria-label={`Selecionar ${String(row.nome)}`} checked={selectedIds.includes(String(row.id))} onChange={(event) => onToggle(String(row.id), event.currentTarget.checked)} /></td>
                  <td>{renderCell(row["entrada/saída"])}</td>
                  <td>{renderCell(row.nome)}</td>
                  <td>{renderCell(row.telefone)}</td>
                  <td>{renderCell(row.acoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

const REENVIAVEIS = new Set(["pendente", "mensagem_agendada", "mensagem_enviada", "sem_resposta", "resposta_incompreensivel"]);
const STATUS_FINAIS = ["confirmado", "nao_comparecera", "cancelado", "tratado_manualmente"];

function Painel({ rows, date, setDate, health, onTratado, onDelete, onReenviar, onEditDispatch, onSubstitute, onTreatment, onRelocate, onAnnouncement }: {
  rows: DashboardRow[];
  date: string;
  setDate: (date: string) => void;
  health: SystemHealthSummary;
  onTratado: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReenviar: (id: string) => Promise<void>;
  onEditDispatch: (group: PainelGroup) => Promise<void>;
  onSubstitute: (row: DashboardRow) => Promise<void>;
  onTreatment: (row: DashboardRow) => void;
  onRelocate: (selectedIds: string[], origin: string, currentScheduleId?: string) => void;
  onAnnouncement: (state: AnnouncementState) => void;
}) {
  const [empresa, setEmpresa] = useState("");
  const [turno, setTurno] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [status, setStatus] = useState("");
  const [reenviandoId, setReenviandoId] = useState("");

  const empresas = uniqueOptions(rows.map((row) => row.escalas?.empresas?.nome));
  const turnos = uniqueOptions(rows.map((row) => row.turnos_empresa?.nome));
  const prioridades = uniqueOptions(rows.map((row) => row.turnos_empresa?.prioridade_envio || "normal"));
  const statuses = uniqueOptions(rows.map(displayStatus));
  const filteredRows = rows.filter((row) => {
    if (empresa && row.escalas?.empresas?.nome !== empresa) return false;
    if (turno && row.turnos_empresa?.nome !== turno) return false;
    if (prioridade && (row.turnos_empresa?.prioridade_envio || "normal") !== prioridade) return false;
    if (status && displayStatus(row) !== status) return false;
    return true;
  });
  const painelGroups = groupRowsByOperation(filteredRows);

  async function handleReenviar(id: string) {
    setReenviandoId(id);
    try {
      await onReenviar(id);
    } finally {
      setReenviandoId("");
    }
  }

  return (
    <div className="grid">
      <SystemHealthPanel summary={health} />
      <section className="panel">
        <div className="form-grid filters">
          <Input name="data" label="Data do painel" type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} />
          <SelectControlled label="Empresa" value={empresa} onChange={setEmpresa} options={empresas} />
          <SelectControlled label="Turno" value={turno} onChange={setTurno} options={turnos} />
          <SelectControlled label="Prioridade" value={prioridade} onChange={setPrioridade} options={prioridades} />
          <SelectControlled label="Status" value={status} onChange={setStatus} options={statuses} />
          <button type="button" onClick={() => { setEmpresa(""); setTurno(""); setPrioridade(""); setStatus(""); }}>Limpar filtros</button>
        </div>
      </section>
      {painelGroups.map((group) => (
        <section className="panel table-wrap operation-board" key={group.key}>
          <div className="operation-command-bar">
            <div className="operation-command-identity">
              <span className="eyebrow">{group.empresa}</span>
              <h2>{group.turno}</h2>
              <p className="status-line">{group.rows.length} colaboradores na fila</p>
            </div>
            <div className="operation-command-metric">
              <span>Horário de disparo</span>
              <strong>{group.horarioDisparo || "-"}</strong>
              <small>{group.dispatchEditable ? "Disponível para ajuste" : "Primeiro envio já realizado"}</small>
            </div>
            <div className="operation-command-metric">
              <span>Respondidos</span>
              <strong>{operationResponseSummary(group.rows).answered}/{operationResponseSummary(group.rows).total}</strong>
              <small>{operationResponseSummary(group.rows).pending} aguardando resposta</small>
            </div>
            <div className="operation-command-actions">
              <Badge value={group.prioridade} />
              {group.dispatchEditable ? (
                <button type="button" onClick={() => void onEditDispatch(group)}><Clock3 size={16} /> Editar disparo</button>
              ) : null}
              <button
                type="button"
                onClick={() => onRelocate(
                  group.rows.map((row) => row.id),
                  `${group.empresa} - ${group.turno}`,
                  group.rows[0]?.turnos_empresa?.empresa_horarios?.id,
                )}
              ><Users size={16} /> Realocar nesta data</button>
              <button
                type="button"
                onClick={() => onAnnouncement({
                  company: group.empresa,
                  schedule: group.turno,
                  scheduleId: group.rows[0]?.turnos_empresa?.empresa_horarios?.id ?? "",
                  operationDate: group.data,
                  rows: group.rows,
                })}
              ><Bell size={16} /> Criar comunicado</button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Colaborador</th><th>Telefone</th><th>Status</th><th>Resposta</th><th>Envios</th><th>Alertas</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.colaboradores?.nome}</td>
                  <td>{maskPhone(row.colaboradores?.telefone)}</td>
                  <td><Badge value={displayStatus(row)} /></td>
                  <td>{row.substituto_nome ? `Substituído por ${row.substituto_nome}` : (row.resposta_normalizada || row.resposta_original || "-")}</td>
                  <td>{[row.mensagem_enviada_em && "Inicial", row.primeiro_lembrete_enviado_em && "L1", row.segundo_lembrete_enviado_em && "L2"].filter(Boolean).join(", ") || "-"}</td>
                  <td>{[row.alerta_sem_resposta_enviado_em && "Sem resposta", row.alerta_incompreensivel_enviado_em && "Incompreensível"].filter(Boolean).join(", ") || "-"}</td>
                  <td className="actions">
                    {REENVIAVEIS.has(row.status_confirmacao) && !STATUS_FINAIS.includes(row.status_confirmacao) ? (
                      <button type="button" disabled={reenviandoId === row.id} onClick={() => void handleReenviar(row.id)}>
                        {reenviandoId === row.id ? "Enviando..." : "Reenviar"}
                      </button>
                    ) : null}
                    {["nao_comparecera", "sem_resposta"].includes(row.status_confirmacao) ? (
                      <button type="button" onClick={() => void onSubstitute(row)}>
                        {row.substituto_nome ? "Editar substituto" : "Informar substituto"}
                      </button>
                    ) : null}
                    {row.status_confirmacao === "confirmado" || row.falso_positivo_em ? (
                      <button type="button" onClick={() => onTreatment(row)}>
                        {row.falso_positivo_em ? "Editar falso positivo" : "Marcar falso positivo"}
                      </button>
                    ) : null}
                    {row.tratado_manualmente ? <Badge value="tratado" /> : <button onClick={() => onTratado(row.id)}>Tratar</button>}
                    <button type="button" className="danger" onClick={() => onDelete(row.id)}>Apagar do painel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!painelGroups.length ? <section className="panel">Nenhum registro encontrado para os filtros escolhidos.</section> : null}
    </div>
  );
}

function SystemHealthPanel({ summary }: { summary: SystemHealthSummary }) {
  const items = [
    ["Última verificação", summary.lastHeartbeatAt ? formatDateTimeBrazil(summary.lastHeartbeatAt) : "-"],
    ["Última mensagem enviada", summary.lastSentAt ? formatDateTimeBrazil(summary.lastSentAt) : "-"],
    ["Última resposta recebida", summary.lastIncomingAt ? formatDateTimeBrazil(summary.lastIncomingAt) : "-"],
    ["Mensagens pendentes", String(summary.pendingMessages)],
    ["Relatórios pendentes", String(summary.pendingReports)],
  ];

  return (
    <section className={`panel health-panel ${summary.status}`}>
      <div className="health-heading">
        <div>
          <span className="eyebrow">Saúde do sistema</span>
          <h2>{summary.statusLabel}</h2>
        </div>
        <Badge value={summary.status} />
      </div>
      <div className="health-grid">
        {items.map(([label, value]) => (
          <div key={label} className="health-item">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {summary.lastError ? <p className="health-error">Situação recente: {humanizeSystemError(summary.lastError)}</p> : null}
    </section>
  );
}

function Relatorios({ rows, date, setDate, onSendWhatsAppReport }: {
  rows: DashboardRow[];
  date: string;
  setDate: (date: string) => void;
  onSendWhatsAppReport: (date: string) => Promise<void>;
}) {
  const empresas = uniqueOptions(rows.map((row) => row.escalas?.empresas?.nome));
  const turnos = uniqueOptions(rows.map((row) => row.turnos_empresa?.nome));
  const [empresa, setEmpresa] = useState("");
  const [turno, setTurno] = useState("");
  const [statusFilter, setStatusFilter] = useState<NominalReportFilter>("todos");
  const [dateText, setDateText] = useState(formatDateBrazil(date));
  const [sendingReport, setSendingReport] = useState(false);
  const filtered = sortByName(rows.filter((row) => {
    if (empresa && row.escalas?.empresas?.nome !== empresa) return false;
    if (turno && row.turnos_empresa?.nome !== turno) return false;
    return true;
  }), (row) => row.colaboradores?.nome);

  const grupos = useMemo(() => buildNominalReportGroups(filtered), [filtered]);
  const visibleGroups = useMemo(() => filterNominalReportGroups(grupos, statusFilter), [grupos, statusFilter]);
  const indicadores = useMemo(() => grupos.reduce((total, grupo) => ({
    colaboradores: total.colaboradores + grupo.total,
    confirmados: total.confirmados + grupo.confirmados.length,
    ausentes: total.ausentes + grupo.naoComparecera.length,
    substituidos: total.substituidos + grupo.substituidos.length,
    falsosPositivos: total.falsosPositivos + grupo.falsosPositivos.length,
    aguardando: total.aguardando + grupo.aguardando.length + grupo.incompreensiveis.length,
  }), { colaboradores: 0, confirmados: 0, ausentes: 0, substituidos: 0, falsosPositivos: 0, aguardando: 0 }), [grupos]);

  function changeReportDate(value: string) {
    setDateText(value);
    const parsed = parseDateBrazil(value);
    if (parsed) setDate(parsed);
  }

  function exportCsv() {
    const csv = toCsv(filtered.map((row) => ({
      data: date,
      empresa: row.escalas?.empresas?.nome,
      colaborador: row.colaboradores?.nome,
      telefone: maskPhone(row.colaboradores?.telefone),
      turno: row.turnos_empresa?.nome,
      entrada: String(row.horario_inicio).slice(0, 5),
      status: displayStatus(row),
      resposta: row.resposta_normalizada,
      substituto: row.substituto_nome || "",
      tratado: row.tratado_manualmente,
    })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-dmr-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function sendWhatsAppReport() {
    setSendingReport(true);
    try {
      await onSendWhatsAppReport(date);
    } finally {
      setSendingReport(false);
    }
  }

  return (
    <div className="grid reports-page">
      <section className="panel screen-only report-controls">
        <h2>Relatório por data</h2>
        <div className="form-grid compact">
          <label>Data (DD/MM/AAAA)<input value={dateText} inputMode="numeric" maxLength={10} onChange={(event) => changeReportDate(event.currentTarget.value)} onBlur={() => setDateText(formatDateBrazil(date))} /></label>
          <SelectControlled label="Empresa" value={empresa} onChange={setEmpresa} options={empresas} />
          <SelectControlled label="Turno" value={turno} onChange={setTurno} options={turnos} />
        </div>
      </section>
      <section className="report-document" id="relatorio-operacional">
        <header className="report-document-header">
          <div>
            <span className="report-brand">DMR SOLUÇÕES</span>
            <h2 aria-label="Relatorio operacional de presenca">Relatório operacional de presença</h2>
            <p>Consolidação nominal das confirmações por empresa e jornada</p>
          </div>
          <div className="report-period">
            <span>Data da operação</span>
            <strong>{formatDateBrazil(date)}</strong>
          </div>
        </header>

        <div className="report-kpis" aria-label="Indicadores consolidados">
          <ReportKpi label="Todos" value={indicadores.colaboradores} filter="todos" activeFilter={statusFilter} onSelect={setStatusFilter} />
          <ReportKpi label="Confirmados" value={indicadores.confirmados} filter="confirmados" activeFilter={statusFilter} onSelect={setStatusFilter} tone="success" />
          <ReportKpi label="Não comparecerão" value={indicadores.ausentes} filter="nao_comparecera" activeFilter={statusFilter} onSelect={setStatusFilter} tone="danger" />
          <ReportKpi label="Substituídos" value={indicadores.substituidos} filter="substituidos" activeFilter={statusFilter} onSelect={setStatusFilter} tone="info" />
          <ReportKpi label="Falsos positivos" value={indicadores.falsosPositivos} filter="falsos_positivos" activeFilter={statusFilter} onSelect={setStatusFilter} tone="warning" />
          <ReportKpi label="Aguardando" value={indicadores.aguardando} filter="aguardando" activeFilter={statusFilter} onSelect={setStatusFilter} tone="warning" />
        </div>

        <div className="report-operations">
        {visibleGroups.map((grupo) => (
          <article className="report-operation" key={grupo.key}>
            <header>
              <div>
                <span className="eyebrow">Empresa</span>
                <h3>{grupo.empresa}</h3>
              </div>
              <div className="report-operation-meta">
                <span>Entrada/Saída</span>
                <strong>{grupo.turno}</strong>
                <small>{grupo.total} colaboradores</small>
              </div>
            </header>
            <div className="report-status-grid">
              <ReportNameList title="Confirmados" rows={grupo.confirmados} />
              <ReportNameList title="Não poderão comparecer" rows={grupo.naoComparecera} />
              <ReportNameList title="Substituídos" rows={grupo.substituidos} showSubstituto />
              <ReportNameList title="Falsos positivos" rows={grupo.falsosPositivos} showResposta showMotivo />
              <ReportNameList title="Aguardando resposta" rows={grupo.aguardando} />
              <ReportNameList title="Resposta incompreensível" rows={grupo.incompreensiveis} showResposta />
              <ReportNameList title="Outros" rows={grupo.outros} showResposta />
            </div>
          </article>
        ))}
        {!visibleGroups.length ? <div className="report-empty">Nenhum registro encontrado para esta data e categoria.</div> : null}
        </div>

        <footer className="report-document-footer">
          <span>DMR Confirmação de Presença</span>
          <span>Documento gerado em {formatDateTimeBrazil(new Date().toISOString())}</span>
        </footer>
      </section>
      <section className="panel actions screen-only report-actions">
        <button className="primary" onClick={exportCsv}><Download size={18} /> Exportar CSV</button>
        <button className="primary" onClick={() => void sendWhatsAppReport()} disabled={sendingReport}><Bell size={18} /> {sendingReport ? "Enviando..." : "Enviar relatório WhatsApp"}</button>
        <button onClick={() => window.print()}><Download size={18} /> Imprimir / PDF</button>
      </section>
    </div>
  );
}

function ReportKpi({ label, value, filter, activeFilter, onSelect, tone = "neutral" }: {
  label: string;
  value: number;
  filter: NominalReportFilter;
  activeFilter: NominalReportFilter;
  onSelect: (filter: NominalReportFilter) => void;
  tone?: string;
}) {
  return (
    <button type="button" className={`report-kpi report-kpi-button ${tone} ${activeFilter === filter ? "active" : ""}`} onClick={() => onSelect(filter)} aria-pressed={activeFilter === filter}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function ReportNameList({ title, rows, showResposta = false, showSubstituto = false, showMotivo = false }: { title: string; rows: NominalReportItem[]; showResposta?: boolean; showSubstituto?: boolean; showMotivo?: boolean }) {
  if (!rows.length) return null;
  return (
    <section className="report-list">
      <h4>{title} <span>{rows.length}</span></h4>
      <ul>
        {rows.map((row) => (
          <li key={`${title}-${row.nome}-${row.resposta ?? ""}`}>
            <strong>{row.nome}</strong>
            <span className="report-item-details">
              {showResposta && row.resposta ? <small>Resposta: {row.resposta}</small> : null}
              {row.confirmadoEm ? <small>Confirmou em: {formatDateTimeBrazil(row.confirmadoEm)}</small> : null}
              {row.revertidoEm ? <small>Reverteu em: {formatDateTimeBrazil(row.revertidoEm)}</small> : null}
              {showSubstituto && row.substituto ? <small>Substituto: {row.substituto}</small> : null}
              {showSubstituto && row.substituidoEm ? <small>Substituição registrada em: {formatDateTimeBrazil(row.substituidoEm)}</small> : null}
              {showMotivo && row.motivo ? <small>Motivo: {row.motivo}</small> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contatos({ rows, onCreate, onEdit, onDelete }: {
  rows: DashboardRow[];
  onCreate: (form: FormData) => Promise<void>;
  onEdit: (row: DashboardRow) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  async function submitContato(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(new FormData(event.currentTarget));
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Novo contato de alerta</h2>
        <form onSubmit={submitContato} className="form-grid compact">
          <Input name="nome" label="Nome" />
          <Input name="telefone" label="Telefone WhatsApp" />
          <Input name="notificar_de" label="Início dos alertas" type="time" defaultValue="00:00" />
          <Input name="notificar_ate" label="Fim dos alertas" type="time" defaultValue="23:59" />
          <Submit label="Criar contato" />
        </form>
      </section>
      <SimpleTable rows={sortByName(rows, (row) => row.nome).map((r) => ({
        ...r,
        telefone: maskPhone(r.telefone),
        "jornada dos alertas": `${String(r.notificar_de ?? "00:00").slice(0, 5)} as ${String(r.notificar_ate ?? "23:59").slice(0, 5)}`,
        acoes: <RowActions row={r} onEdit={onEdit} onDelete={onDelete} />,
      }))} columns={["nome", "telefone", "jornada dos alertas", "acoes"]} />
    </div>
  );
}

function Logs({ rows, onClear }: { rows: DashboardRow[]; onClear: () => Promise<void> }) {
  const logs = rows.map((row) => ({
    criado_em: formatDateTimeBrazil(row.criado_em),
    usuario: auditActorLabel(row),
    registro: formatAuditMessage(row),
    entidade: row.entidade,
  }));
  return (
    <div className="grid">
      <section className="panel config-intro">
        <h2>Auditoria operacional</h2>
        <p>Acompanhe quem criou, editou, apagou, colocou mensagens em fila ou tratou registros no sistema.</p>
        <button type="button" className="danger" onClick={() => void onClear()}>Limpar registros</button>
      </section>
      <SimpleTable rows={logs} columns={["criado_em", "usuario", "registro", "entidade"]} />
    </div>
  );
}

function Config({ rows, onSaveConfig }: { rows: DashboardRow[]; onSaveConfig: (chave: string, valor: Record<string, unknown>) => Promise<void> }) {
  const configs = rows.map((row) => ({
    ...row,
    title: configTitle(row.chave),
    summary: configSummary(row.chave, row.valor),
  }));

  return (
    <div className="grid">
      <section className="panel config-intro">
        <h2>Configurações técnicas do sistema</h2>
        <p>
          O que pode ser feito aqui: ajustar regras operacionais do bot, limites de tentativa e intervalos usados na fila.
          Salve apenas mudanças planejadas; os próximos disparos passam a usar as regras gravadas nesta tela.
        </p>
      </section>
      <BotLocalPanel />
      <section className="config-grid" aria-label="Leitura operacional das configurações">
        {configs.map((config) => <ConfigCard key={config.chave} row={config} onSaveConfig={onSaveConfig} />)}
        {!configs.length ? <section className="panel">Nenhuma configuração cadastrada.</section> : null}
      </section>
    </div>
  );
}

function BotLocalPanel() {
  const [copied, setCopied] = useState(false);
  const command = "powershell -ExecutionPolicy Bypass -File scripts/start-bot.ps1";

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="panel bot-panel">
      <div>
        <span className="eyebrow">Bot local</span>
        <h2>Iniciar WhatsApp</h2>
        <p>O navegador não pode abrir processos do Windows diretamente. Use o comando abaixo na raiz do projeto; o script valida o `.env` antes de iniciar.</p>
      </div>
      <code>{command}</code>
      <button type="button" className="primary" onClick={() => void copyCommand()}>{copied ? "Comando copiado" : "Copiar comando"}</button>
    </section>
  );
}

function ConfigCard({ row, onSaveConfig }: { row: DashboardRow; onSaveConfig: (chave: string, valor: Record<string, unknown>) => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    await onSaveConfig(row.chave, configFromForm(row.chave, row.valor, form));
  }

  return (
    <section className="panel config-card">
      <div>
        <span className="eyebrow">Leitura operacional</span>
        <h3>{row.title}</h3>
      </div>
      <p>{row.descricao || "Parâmetro interno do sistema."}</p>
      <pre>{row.summary}</pre>
      {configFields(row.chave, row.valor).length ? (
        <form onSubmit={submit} className="config-form">
          {configFields(row.chave, row.valor).map((field) => (
            <Input key={`${row.chave}-${field.name}`} name={field.name} label={field.label} type="number" min="0" defaultValue={field.value} />
          ))}
          <button className="primary" type="submit">Salvar regras</button>
        </form>
      ) : null}
    </section>
  );
}

function configFields(key: string, value?: ConfigValue) {
  if (key === "limites_bot") {
    return [
      { name: "max_tentativas_envio", label: "Tentativas de envio", value: value?.max_tentativas_envio ?? 3 },
      { name: "max_respostas_incompreensiveis", label: "Respostas incompreensíveis", value: value?.max_respostas_incompreensiveis ?? 3 },
    ];
  }
  if (key === "intervalos_bot") {
    return [
      { name: "alta_min_segundos", label: "Alta mín. segundos", value: value?.alta?.min_segundos ?? 6 },
      { name: "alta_max_segundos", label: "Alta máx. segundos", value: value?.alta?.max_segundos ?? 15 },
      { name: "normal_min_segundos", label: "Normal mín. segundos", value: value?.normal?.min_segundos ?? 25 },
      { name: "normal_max_segundos", label: "Normal máx. segundos", value: value?.normal?.max_segundos ?? 45 },
    ];
  }
  return [];
}

function configFromForm(key: string, current: ConfigValue | undefined, form: Record<string, FormDataEntryValue>) {
  const numberValue = (name: string, fallback: number) => Number(form[name] ?? fallback);
  if (key === "limites_bot") {
    return {
      max_tentativas_envio: numberValue("max_tentativas_envio", current?.max_tentativas_envio ?? 3),
      max_respostas_incompreensiveis: numberValue("max_respostas_incompreensiveis", current?.max_respostas_incompreensiveis ?? 3),
    };
  }
  if (key === "intervalos_bot") {
    return {
      alta: {
        min_segundos: numberValue("alta_min_segundos", current?.alta?.min_segundos ?? 6),
        max_segundos: numberValue("alta_max_segundos", current?.alta?.max_segundos ?? 15),
      },
      normal: {
        min_segundos: numberValue("normal_min_segundos", current?.normal?.min_segundos ?? 25),
        max_segundos: numberValue("normal_max_segundos", current?.normal?.max_segundos ?? 45),
      },
    };
  }
  return current ?? {};
}

function configTitle(key: string) {
  const titles: Record<string, string> = {
    intervalos_bot: "Intervalos do bot",
    limites_bot: "Limites de tentativa",
  };
  return titles[key] ?? key.replace(/_/g, " ");
}

function configSummary(key: string, value?: ConfigValue) {
  if (key === "intervalos_bot") {
    return `Alta: ${value?.alta?.min_segundos ?? "-"}-${value?.alta?.max_segundos ?? "-"}s\nNormal: ${value?.normal?.min_segundos ?? "-"}-${value?.normal?.max_segundos ?? "-"}s`;
  }
  if (key === "limites_bot") {
    return `Envios por colaborador: ${value?.max_tentativas_envio ?? "-"}\nRespostas incompreensíveis: ${value?.max_respostas_incompreensiveis ?? "-"}`;
  }
  return JSON.stringify(value ?? {}, null, 2);
}

function SimpleTable({ rows, columns }: { rows: Record<string, unknown>[]; columns: string[] }) {
  return (
    <section className="panel table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{renderCell(row[column])}</td>)}</tr>
          )) : <tr><td colSpan={columns.length}>Nenhum registro encontrado.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function RowActions({ row, onEdit, onDelete }: {
  row: DashboardRow;
  onEdit: (row: DashboardRow) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="actions">
      <button type="button" onClick={() => void onEdit(row)}>Editar</button>
      <button type="button" className="danger" onClick={() => void onDelete(row.id)}>Apagar</button>
    </div>
  );
}

function EditDialog({ state, onClose }: { state: EditDialogState; onClose: () => void }) {
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries()) as Record<string, string>;
    try {
      const result = await state.onSave(values);
      if (typeof result === "string") {
        setDialogError(result);
        return;
      }
      if (result === false) {
        setDialogError("Não foi possível salvar. Revise os dados e tente novamente.");
        return;
      }
      onClose();
    } catch (error) {
      setDialogError(toMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title">
        <div>
          <h2 id="edit-dialog-title">{state.title}</h2>
          {state.description ? <p>{state.description}</p> : null}
        </div>
        <form onSubmit={submit} className="grid">
          {dialogError ? <p className="error" role="alert">{dialogError}</p> : null}
          {state.fields.map((field) => (
            field.options ? (
              <label key={field.name}>
                {field.label}
                <select name={field.name} defaultValue={field.value}>
                  {field.options.map(([value, label]) => <option key={`${field.name}-${value}`} value={value}>{label}</option>)}
                </select>
              </label>
            ) : (
              <Input key={field.name} name={field.name} label={field.label} type={field.type ?? "text"} defaultValue={field.value} />
            )
          ))}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button className="primary" type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar alterações"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return <label>{label}<input {...inputProps} /></label>;
}

function Select({ name, label, options }: { name: string; label: string; options: [string, string][] }) {
  return (
    <label>
      {label}
      <select name={name}>
        {options.map(([value, text]) => <option key={`${name}-${value}`} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

function SelectControlled({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Todos</option>
        {options.map((option) => <option key={`${label}-${option}`} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Submit({ label }: { label: string }) {
  return <button className="primary" type="submit"><Plus size={18} /> {label}</button>;
}

function Badge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    nao_comparecera: "não comparecerá",
    sem_resposta: "sem resposta",
    resposta_incompreensivel: "resposta incompreensível",
    erro_envio: "erro de envio",
    substituido: "substituído",
    contrato_encerrado: "contrato encerrado",
  };
  return <span className={`badge ${value}`}>{labels[value] ?? value}</span>;
}

function renderCell(value: unknown) {
  if (isValidElement(value)) return value;
  if (typeof value === "boolean") return <Badge value={value ? "ativo" : "inativo"} />;
  if (typeof value === "string" && ["alta", "normal", "confirmado", "nao_comparecera", "sem_resposta", "resposta_incompreensivel", "erro_envio", "substituido"].includes(value)) return <Badge value={value} />;
  return String(value ?? "-");
}

function uniqueOptions(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "")).filter(Boolean))].sort(compareNamesPtBr);
}

function empresaNome(empresas: DashboardRow[], empresaId: string) {
  return empresas.find((empresa) => empresa.id === empresaId)?.nome ?? "-";
}

function nomeTurnoPorHorario(entrada: string, saida?: string | null) {
  return saida ? `${String(entrada).slice(0, 5)} as ${String(saida).slice(0, 5)}` : `Entrada ${String(entrada).slice(0, 5)}`;
}

function horarioLabel(row: DashboardRow) {
  return `${String(row.horario_entrada).slice(0, 5)} as ${String(row.horario_saida).slice(0, 5)}`;
}

function turnoLabel(row: DashboardRow, empresaHorarios: DashboardRow[]) {
  const horario = empresaHorarios.find((item) => item.id === row.empresa_horario_id);
  return horario ? horarioLabel(horario) : String(row.horario_inicio).slice(0, 5);
}

function groupRowsByOperation(rows: DashboardRow[]) {
  const map = new Map<string, PainelGroup>();
  for (const row of rows) {
    const empresa = row.escalas?.empresas?.nome ?? "Sem empresa";
    const turno = row.turnos_empresa?.nome ?? String(row.horario_inicio).slice(0, 5);
    const escalaId = row.escalas?.id ?? "";
    const turnoId = row.turnos_empresa?.id ?? "";
    const key = `${escalaId}|${turnoId}`;
    const current = map.get(key) ?? ({
      key,
      empresa,
      turno,
      prioridade: row.turnos_empresa?.prioridade_envio || "normal",
      escalaId,
      turnoId,
      data: row.escalas?.data ?? "",
      horarioDisparo: String(row.horario_inicio_disparo ?? "").slice(0, 5),
      dispatchEditable: true,
      rows: [],
    } as PainelGroup);
    current.rows.push(row);
    if (row.mensagem_enviada_em) current.dispatchEditable = false;
    map.set(key, current);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(comparePanelRows),
    }))
    .sort((a, b) => compareNamesPtBr(a.empresa, b.empresa) || compareNamesPtBr(a.turno, b.turno));
}

function displayStatus(row: DashboardRow) {
  return operationalDisplayStatus(row);
}

function contractTypeLabel(value: unknown) {
  if (value === "freelancer") return "Freelancer";
  if (value === "intermitente") return "Contrato Intermitente";
  return "Não informado";
}

function minutesUntilNextStart(horario: string, minutesNow: number) {
  const [hours, minutes] = String(horario).slice(0, 5).split(":").map(Number);
  const start = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  const diff = start - minutesNow;
  return diff >= 0 ? diff : diff + 24 * 60;
}

function toMessage(error: unknown) {
  if (error instanceof z.ZodError) return "Preencha as informações.";
  if (isUniqueConstraintError(error)) return "Registro já existe. Revise os dados ou edite o registro existente.";
  if (isForeignKeyError(error)) return "Registro possui histórico operacional e não pode ser apagado diretamente.";
  const dashboardMessage = dashboardLoadErrorMessage(error);
  if (dashboardMessage) return dashboardMessage;
  const supabaseMessage = messageFromSupabaseError(error);
  if (supabaseMessage) return supabaseMessage;
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a ação.";
}

function messageFromSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const maybe = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = String(maybe.message ?? "").trim();
  const details = String(maybe.details ?? "").trim();
  const hint = String(maybe.hint ?? "").trim();
  const raw = [message, details, hint].filter(Boolean).join(" ");
  if (!raw) return "";
  if (maybe.code === "42883" || /function .* does not exist/i.test(raw)) {
    return "Ação não disponível no banco remoto. Rode o deploy das migrations do Supabase e atualize a página.";
  }
  if (maybe.code === "42501" || /permission denied|not authorized|unauthorized/i.test(raw)) {
    return "Seu usuário não tem permissão para executar esta ação. Confira se ele está como admin no Dashboard.";
  }
  return message || details || hint;
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === "23505" || String(maybe.message ?? "").includes("duplicate key value violates unique constraint");
}

function isForeignKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === "23503" || String(maybe.message ?? "").includes("violates foreign key constraint");
}
