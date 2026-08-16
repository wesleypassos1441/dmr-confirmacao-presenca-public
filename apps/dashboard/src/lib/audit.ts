type AuditDetails = Record<string, unknown>;

export type AuditRow = {
  ator_email?: string | null;
  acao?: string | null;
  entidade_id?: string | null;
  detalhes?: AuditDetails | null;
};

export function auditActorLabel(row: AuditRow) {
  return text(row.detalhes?.usuario_nome) || text(row.ator_email) || text(row.detalhes?.usuario_email) || "Usuario do dashboard";
}

const ACTION_LABELS: Record<string, string> = {
  criar_empresa: "Empresa adicionada",
  editar_empresa: "Empresa atualizada",
  apagar_empresa: "Empresa apagada",
  criar_horario_empresa: "Jornada adicionada",
  apagar_horario_empresa: "Jornada apagada",
  editar_jornada_semanal: "Jornada semanal atualizada",
  salvar_excecao_jornada: "Horário excepcional salvo",
  criar_operacao_com_equipe: "Operação criada com equipe",
  aplicar_excecao_operacao: "Horário excepcional aplicado à operação",
  marcar_falso_positivo: "Confirmação marcada como falso positivo",
  reverter_falso_positivo: "Falso positivo revertido",
  definir_substituto: "Substituto informado",
  remover_substituto: "Substituto removido",
  realocar_equipe_permanente: "Equipe realocada permanentemente",
  realocar_equipe_data: "Equipe realocada somente nesta data",
  alterar_status_empresa: "Situação da empresa atualizada",
  adicionar_colaborador_equipe: "Colaborador adicionado à equipe",
  remover_colaborador_equipe: "Colaborador removido da equipe",
  criar_comunicado: "Comunicado colocado na fila de envio",
};

export function humanizeAuditAction(action: string | null | undefined) {
  const key = text(action);
  return ACTION_LABELS[key] ?? (key.replace(/_/g, " ") || "Ação operacional");
}

export function formatAuditMessage(row: AuditRow) {
  const actor = auditActorLabel(row);
  const action = text(row.acao);
  const details = row.detalhes ?? {};

  if (action === "gerar_fila_confirmacoes_sql") {
    const total = Number(details.mensagens_criadas ?? details.colaboradores_adicionados ?? 0);
    return total > 0
      ? `Mensagens colocadas em fila de disparo para ${total} colaboradores.`
      : "Mensagens colocadas em fila de disparo.";
  }

  if (action === "gerar_operacao_manual") {
    const total = Number(details.colaboradores_adicionados ?? 0);
    const data = text(details.data);
    const horario = text(details.horario_inicio_disparo);
    const suffix = [data && `data ${data}`, horario && `disparo ${horario}`].filter(Boolean).join(", ");
    return `${actor} adicionou uma fila de disparos${total > 0 ? ` para ${total} colaboradores` : ""}${suffix ? ` (${suffix})` : ""}.`;
  }

  if (action === "remover_colaborador_equipe") {
    const colaborador = text(details.colaborador) || "um colaborador";
    const empresa = text(details.empresa) || "uma equipe";
    const horario = scheduleLabel(details.horario_entrada, details.horario_saida);
    return `${actor} removeu ${colaborador} da equipe ${empresa}${horario ? ` - ${horario}` : ""}.`;
  }

  if (action === "adicionar_colaborador_equipe") {
    const colaborador = text(details.colaborador) || "um colaborador";
    const empresa = text(details.empresa) || "uma equipe";
    return `${actor} adicionou ${colaborador} à equipe ${empresa}.`;
  }

  if (action === "alterar_status_empresa") {
    const empresa = text(details.empresa) || "uma empresa";
    const lifecycleAction = text(details.acao);
    const labels: Record<string, string> = {
      desativar: "desativou",
      reativar: "reativou",
      encerrar_contrato: "encerrou o contrato de",
    };
    return `${actor} ${labels[lifecycleAction] ?? "alterou a situação de"} ${empresa}.`;
  }

  if (action === "definir_substituto") {
    return `${actor} informou ${text(details.substituto) || "um substituto"} para substituir ${text(details.colaborador) || "um colaborador"} em ${text(details.empresa) || "uma empresa"}.`;
  }

  if (action === "remover_substituto") {
    return `${actor} removeu o substituto informado para ${text(details.colaborador) || "um colaborador"}.`;
  }

  if (action === "editar_horario_disparo") {
    return `${actor} alterou o horário de disparo de ${text(details.empresa) || "uma operação"} para ${text(details.horario_disparo) || "um novo horário"}.`;
  }

  if (action === "criar_comunicado") {
    const assunto = text(details.assunto) || "Sem assunto";
    const total = Number(details.destinatarios ?? 0);
    return `${actor} colocou o comunicado "${assunto}" na fila${total > 0 ? ` para ${total} colaboradores` : ""}.`;
  }

  if (action === "realocar_equipe_data" || action === "realocar_equipe_permanente") {
    const total = Number(details.movidos ?? 0);
    const destino = text(details.destino) || "a equipe selecionada";
    const alcance = action === "realocar_equipe_data" ? " somente nesta data" : " permanentemente";
    return `${actor} realocou ${total || "a equipe"}${total ? " colaboradores" : ""} para ${destino}${alcance}.`;
  }

  if (action === "editar_jornada_semanal") {
    const empresa = text(details.empresa) || "uma empresa";
    const horario = scheduleLabel(details.entrada, details.saida);
    return `${actor} atualizou a jornada semanal de ${empresa}${horario ? ` para ${horario}` : ""}.`;
  }

  if (action === "salvar_excecao_jornada" || action === "aplicar_excecao_operacao") {
    const empresa = text(details.empresa) || "uma empresa";
    const data = text(details.data);
    const horario = scheduleLabel(details.entrada, details.saida);
    return `${actor} ${action === "salvar_excecao_jornada" ? "salvou" : "aplicou"} um horário excepcional para ${empresa}${data ? ` em ${data}` : ""}${horario ? ` (${horario})` : ""}.`;
  }

  if (action === "marcar_falso_positivo" || action === "reverter_falso_positivo") {
    const colaborador = text(details.colaborador) || "um colaborador";
    const empresa = text(details.empresa);
    return action === "marcar_falso_positivo"
      ? `${actor} marcou a confirmação de ${colaborador}${empresa ? ` em ${empresa}` : ""} como falso positivo.`
      : `${actor} reverteu o falso positivo de ${colaborador}${empresa ? ` em ${empresa}` : ""}.`;
  }

  const labels: Record<string, string> = {
    criar_empresa: "adicionou uma empresa",
    editar_empresa: "editou uma empresa",
    apagar_empresa: "apagou uma empresa",
    criar_horario_empresa: "adicionou um horario de empresa",
    apagar_horario_empresa: "apagou um horario de empresa",
    criar_colaborador: "adicionou um colaborador",
    editar_colaborador: "editou um colaborador",
    apagar_colaborador: "apagou um colaborador",
    criar_turno: "adicionou uma entrada",
    editar_turno: "editou uma entrada",
    apagar_turno: "apagou uma entrada",
    criar_contato_alerta: "adicionou um contato de alerta",
    editar_contato_alerta: "editou um contato de alerta",
    apagar_contato_alerta: "apagou um contato de alerta",
    editar_configuracao: "alterou uma regra de configuracao",
    marcar_tratado_manualmente: "marcou uma pendencia como tratada",
    apagar_painel_dia: "apagou um registro do Painel do Dia",
    limpar_logs_operacionais: "limpou os registros de auditoria",
    sessao_whatsapp_indisponivel: "registrou indisponibilidade da sessao do WhatsApp",
    erro_bot: "registrou uma falha do bot",
  };

  const actionLabel = labels[action] ?? humanizeAuditAction(action).toLocaleLowerCase("pt-BR");
  const target = text(details.nome) || text(details.colaborador) || text(details.empresa) || text(row.entidade_id);
  return `${actor} ${actionLabel}${target ? `: ${target}` : ""}.`;
}

function scheduleLabel(entrada: unknown, saida: unknown) {
  const start = text(entrada).slice(0, 5);
  const end = text(saida).slice(0, 5);
  return start && end ? `${start} as ${end}` : "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}
