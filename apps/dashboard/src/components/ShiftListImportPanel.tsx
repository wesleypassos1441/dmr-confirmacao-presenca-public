"use client";

import { useMemo, useState } from "react";
import { validarHorarioDisparoFuturo } from "@dmr-confirmacao/core";
import {
  classifyImportedCollaborators,
  parseShiftListImport,
  resolveImportedOperation,
  type ClassifiedImportedCollaborator,
  type ImportCollaborator,
  type ImportCompany,
  type ImportLink,
  type ImportSchedule,
  type ImportShift,
  type ParsedShiftListImport,
  type ResolvedImportedOperation,
} from "../lib/shift-list-import";

const LIST_MODEL = `Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

Hugo Octávio Souza de Oliveira
Gabriel Silva da Cruz
Rafael Christian de Oliveira Souza
Warley Thiago da Silva`;

type Resolution = {
  included: boolean;
  collaboratorId?: string;
};

type EditingRow = {
  name: string;
  phone: string;
  collaboratorId?: string;
};

type ImportReview = {
  parsed: ParsedShiftListImport;
  operation: ResolvedImportedOperation;
  rows: ClassifiedImportedCollaborator[];
};

export type AppliedShiftListImport = {
  companyId: string;
  scheduleId: string;
  shiftId: string;
  operationDate: string;
  dispatchTime: string;
  collaboratorIds: string[];
};

export type EnsureImportedShiftInput = {
  companyId: string;
  scheduleId: string;
};

export type ShiftListImportPanelProps = {
  companies: ImportCompany[];
  schedules: ImportSchedule[];
  shifts: ImportShift[];
  preferredScheduleId?: string;
  preferredShiftId?: string;
  collaborators: ImportCollaborator[];
  links: ImportLink[];
  selectedCollaboratorIds: string[];
  onEnsureShift: (input: EnsureImportedShiftInput) => Promise<string>;
  onLinkExisting: (collaboratorId: string, scheduleId: string) => Promise<string>;
  onUpdateAndLink: (input: {
    collaboratorId: string;
    name: string;
    phone: string;
    scheduleId: string;
  }) => Promise<string>;
  onCreateAndLink: (input: {
    name: string;
    phone: string;
    scheduleId: string;
  }) => Promise<string>;
  onApply: (input: AppliedShiftListImport) => void;
};

const STATUS_LABELS = {
  team: "Já está nesta equipe",
  similar_team: "Correspondência provável na equipe",
  bank: "Encontrado no banco",
  new: "Novo colaborador",
  ambiguous: "Nome duplicado no banco",
} as const;

export function maskImportedPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "Telefone não informado";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Não foi possível concluir. Revise os dados e tente novamente.";
}

function rowKey(row: ClassifiedImportedCollaborator): string {
  return row.importedName;
}

export function ShiftListImportPanel({
  companies,
  schedules,
  shifts,
  preferredScheduleId,
  preferredShiftId,
  collaborators,
  links,
  selectedCollaboratorIds,
  onEnsureShift,
  onLinkExisting,
  onUpdateAndLink,
  onCreateAndLink,
  onApply,
}: ShiftListImportPanelProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [review, setReview] = useState<ImportReview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [editingRows, setEditingRows] = useState<Record<string, EditingRow>>({});
  const [editingEnabled, setEditingEnabled] = useState<Record<string, boolean>>({});
  const [candidateSelections, setCandidateSelections] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState("");
  const [applying, setApplying] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [copyStatus, setCopyStatus] = useState("");

  const unresolvedCount = useMemo(() => {
    if (!review) return 0;
    return review.rows.filter((row) => !resolutions[rowKey(row)]).length;
  }, [resolutions, review]);

  const includedCount = useMemo(
    () => Object.values(resolutions).filter((item) => item.included && item.collaboratorId).length,
    [resolutions],
  );

  function resetImport() {
    setSource("");
    setReview(null);
    setResolutions({});
    setEditingRows({});
    setEditingEnabled({});
    setCandidateSelections({});
    setSavingKey("");
    setApplying(false);
    setGeneralError("");
    setRowErrors({});
    setCopyStatus("");
  }

  function cancelImport() {
    resetImport();
    setOpen(false);
  }

  async function copyModel() {
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(LIST_MODEL);
      setCopyStatus("Modelo copiado.");
    } catch {
      setCopyStatus("Não foi possível copiar automaticamente. Selecione o modelo abaixo.");
    }
  }

  function interpretList() {
    setGeneralError("");
    setRowErrors({});

    try {
      const parsed = parseShiftListImport(source);
      const operation = resolveImportedOperation({
        companyName: parsed.company,
        entryTime: parsed.entryTime,
        allowMissingShift: true,
        preferredScheduleId,
        preferredShiftId,
        companies,
        schedules,
        shifts,
      });
      validarHorarioDisparoFuturo({
        dataEscala: parsed.operationDate,
        horarioInicioDisparo: parsed.dispatchTime,
      });
      const rows = classifyImportedCollaborators({
        names: parsed.names,
        companyId: operation.companyId,
        scheduleId: operation.scheduleId,
        collaborators,
        links,
      });
      const initialResolutions: Record<string, Resolution> = {};
      const initialEdits: Record<string, EditingRow> = {};
      const initialCandidates: Record<string, string> = {};

      for (const row of rows) {
        const key = rowKey(row);
        if (
          (row.status === "team" || row.status === "similar_team") &&
          row.collaboratorId
        ) {
          initialResolutions[key] = {
            included: true,
            collaboratorId: row.collaboratorId,
          };
        }
        if (row.status === "new") {
          initialEdits[key] = { name: row.importedName, phone: "" };
        }
        if (row.status === "bank" && row.candidates[0]) {
          initialEdits[key] = {
            collaboratorId: row.candidates[0].id,
            name: row.candidates[0].name,
            phone: row.candidates[0].phone,
          };
        }
        if (row.status === "ambiguous" && row.candidates[0]) {
          initialCandidates[key] = row.candidates[0].id;
        }
      }

      setReview({ parsed, operation, rows });
      setResolutions(initialResolutions);
      setEditingRows(initialEdits);
      setEditingEnabled({});
      setCandidateSelections(initialCandidates);
    } catch (error) {
      setReview(null);
      setResolutions({});
      setGeneralError(errorMessage(error));
    }
  }

  function excludeRow(row: ClassifiedImportedCollaborator) {
    const key = rowKey(row);
    setResolutions((current) => ({ ...current, [key]: { included: false } }));
    setRowErrors((current) => ({ ...current, [key]: "" }));
  }

  function updateEditingRow(key: string, field: "name" | "phone", value: string) {
    setEditingRows((current) => {
      const currentEdit = current[key];
      if (!currentEdit) return current;
      return {
        ...current,
        [key]: { ...currentEdit, [field]: value },
      };
    });
    setRowErrors((current) => ({ ...current, [key]: "" }));
  }

  async function linkCandidate(row: ClassifiedImportedCollaborator, collaboratorId: string) {
    if (!review) return;
    const key = rowKey(row);
    setSavingKey(key);
    setRowErrors((current) => ({ ...current, [key]: "" }));
    try {
      const resolvedId = await onLinkExisting(collaboratorId, review.operation.scheduleId);
      setResolutions((current) => ({
        ...current,
        [key]: { included: true, collaboratorId: resolvedId },
      }));
    } catch (error) {
      setRowErrors((current) => ({ ...current, [key]: errorMessage(error) }));
    } finally {
      setSavingKey("");
    }
  }

  async function persistEditedRow(
    row: ClassifiedImportedCollaborator,
    scheduleId: string,
  ): Promise<string> {
    const edit = editingRows[rowKey(row)];
    if (!edit) {
      throw new Error("Escolha um cadastro existente ou clique em Não incluir.");
    }
    if (!edit.name.trim() || !edit.phone.trim()) {
      throw new Error("Preencha o nome e o telefone WhatsApp.");
    }

    return edit.collaboratorId
      ? onUpdateAndLink({
          collaboratorId: edit.collaboratorId,
          name: edit.name,
          phone: edit.phone,
          scheduleId,
        })
      : onCreateAndLink({
          name: edit.name,
          phone: edit.phone,
          scheduleId,
        });
  }

  async function saveEditedRow(row: ClassifiedImportedCollaborator) {
    if (!review) return;
    const key = rowKey(row);
    setSavingKey(key);
    setRowErrors((current) => ({ ...current, [key]: "" }));
    try {
      const resolvedId = await persistEditedRow(row, review.operation.scheduleId);
      setResolutions((current) => ({
        ...current,
        [key]: { included: true, collaboratorId: resolvedId },
      }));
    } catch (error) {
      setRowErrors((current) => ({ ...current, [key]: errorMessage(error) }));
    } finally {
      setSavingKey("");
    }
  }

  async function applyToTeam() {
    if (!review || applying || savingKey) return;

    const activeReview = review;
    const nextResolutions = { ...resolutions };
    const nextErrors = { ...rowErrors };
    let failedCount = 0;

    setApplying(true);
    setGeneralError("");
    try {
      for (const row of activeReview.rows) {
        const key = rowKey(row);
        if (nextResolutions[key]) continue;

        try {
          const resolvedId = await persistEditedRow(
            row,
            activeReview.operation.scheduleId,
          );
          nextResolutions[key] = { included: true, collaboratorId: resolvedId };
          nextErrors[key] = "";
        } catch (error) {
          nextErrors[key] = errorMessage(error);
          failedCount += 1;
        }
      }

      setResolutions(nextResolutions);
      setRowErrors(nextErrors);

      if (failedCount > 0) {
        setGeneralError(
          `${failedCount} item(ns) ainda precisa(m) de correção. Os contatos válidos já foram salvos e vinculados.`,
        );
        return;
      }

      const importedIds = activeReview.rows.flatMap((row) => {
        const resolution = nextResolutions[rowKey(row)];
        return resolution?.included && resolution.collaboratorId
          ? [resolution.collaboratorId]
          : [];
      });
      const uniqueIds = [...new Set(importedIds)];
      if (uniqueIds.length === 0) {
        setGeneralError("Inclua pelo menos um colaborador antes de aplicar a equipe.");
        return;
      }

      let shiftId = activeReview.operation.shiftId;
      if (!shiftId) {
        try {
          shiftId = await onEnsureShift({
            companyId: activeReview.operation.companyId,
            scheduleId: activeReview.operation.scheduleId,
          });
        } catch (error) {
          setGeneralError(errorMessage(error));
          return;
        }
      }

      onApply({
        companyId: activeReview.operation.companyId,
        scheduleId: activeReview.operation.scheduleId,
        shiftId,
        operationDate: activeReview.parsed.operationDate,
        dispatchTime: activeReview.parsed.dispatchTime,
        collaboratorIds: uniqueIds,
      });
      resetImport();
      setOpen(false);
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="shift-list-import" aria-labelledby="shift-list-import-title">
      <div className="shift-list-import-heading">
        <div>
          <span className="eyebrow">Preenchimento facilitado</span>
          <h3 id="shift-list-import-title">Importar lista padronizada</h3>
          <p>
            Cole empresa, entrada, data, horário de disparo e nomes. Você revisará tudo
            antes de aplicar à equipe do dia. Marcadores -, *, • e ✅ e observações entre
            parênteses serão ignorados.
          </p>
        </div>
        {!open ? (
          <button type="button" onClick={() => setOpen(true)}>
            Importar lista
          </button>
        ) : null}
      </div>

      <details>
        <summary>Ver modelo de preenchimento</summary>
        <div className="import-model">
          <pre>{LIST_MODEL}</pre>
          <div className="actions">
            <button type="button" onClick={() => void copyModel()}>
              Copiar modelo
            </button>
            {copyStatus ? <span role="status">{copyStatus}</span> : null}
          </div>
        </div>
      </details>

      {open ? (
        <div className="shift-list-import-body">
          <label>
            Lista para importar
            <textarea
              rows={9}
              value={source}
              onChange={(event) => {
                setSource(event.currentTarget.value);
                setGeneralError("");
              }}
              placeholder="Cole a lista seguindo o modelo acima."
            />
          </label>

          <div className="actions">
            <button type="button" onClick={cancelImport}>
              Cancelar importação
            </button>
            <button type="button" className="primary" onClick={interpretList}>
              Interpretar lista
            </button>
          </div>
          {generalError ? (
            <p className="error" role="alert">
              {generalError}
            </p>
          ) : null}
        </div>
      ) : null}

      {open && review ? (
        <div className="import-review">
          <div className="shift-list-import-summary">
            <div>
              <span>Empresa</span>
              <strong>{review.parsed.company}</strong>
            </div>
            <div>
              <span>Entrada/Saída</span>
              <strong>{review.operation.scheduleLabel}</strong>
            </div>
            <div>
              <span>Data</span>
              <strong>{review.parsed.operationDate.split("-").reverse().join("/")}</strong>
            </div>
            <div>
              <span>Disparo</span>
              <strong>{review.parsed.dispatchTime}</strong>
            </div>
          </div>

          {review.parsed.duplicateNames.length ? (
            <p className="warning">
              Nomes repetidos ignorados: {review.parsed.duplicateNames.join(", ")}.
            </p>
          ) : null}

          <div className="import-review-list">
            {review.rows.map((row) => {
              const key = rowKey(row);
              const resolution = resolutions[key];
              const edit = editingRows[key];
              const selectedCandidateId = candidateSelections[key] ?? "";
              const selectedCandidate = row.candidates.find(
                (candidate) => candidate.id === selectedCandidateId,
              );

              return (
                <article
                  className="import-review-item"
                  data-status={row.status}
                  key={key}
                >
                  <div className="import-review-identity">
                    <strong>{row.importedName}</strong>
                    <span>{STATUS_LABELS[row.status]}</span>
                    {resolution?.included ? (
                      <small className="success">Pronto para incluir</small>
                    ) : null}
                    {resolution && !resolution.included ? (
                      <small>Não será incluído</small>
                    ) : null}
                  </div>

                  {row.status === "team" || row.status === "similar_team" ? (
                    <div className="import-review-contact">
                      {row.status === "similar_team" ? (
                        <strong className="import-registered-name">
                          Cadastrado como: {row.candidates[0]?.name}
                        </strong>
                      ) : null}
                      <span>{maskImportedPhone(row.candidates[0]?.phone)}</span>
                      {!resolution?.included ? (
                        <button type="button" onClick={() => {
                          if (row.collaboratorId) {
                            setResolutions((current) => ({
                              ...current,
                              [key]: {
                                included: true,
                                collaboratorId: row.collaboratorId,
                              },
                            }));
                          }
                        }}>
                          Incluir
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {row.status === "bank" && edit ? (
                    <div className="import-review-contact">
                      <span>{maskImportedPhone(edit.phone)}</span>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={applying || savingKey === key || Boolean(resolution)}
                          onClick={() => {
                            if (row.collaboratorId) {
                              void linkCandidate(row, row.collaboratorId);
                            }
                          }}
                        >
                          Usar contato e vincular
                        </button>
                        <button
                          type="button"
                          disabled={applying || savingKey === key || Boolean(resolution)}
                          onClick={() =>
                            setEditingEnabled((current) => ({ ...current, [key]: true }))
                          }
                        >
                          Editar contato e vincular
                        </button>
                      </div>
                      {!resolution && editingEnabled[key] ? (
                        <div className="import-edit-fields">
                          <label>
                            Nome
                            <input
                              value={edit.name}
                              onChange={(event) =>
                                updateEditingRow(key, "name", event.currentTarget.value)
                              }
                            />
                          </label>
                          <label>
                            Telefone WhatsApp
                            <input
                              inputMode="tel"
                              value={edit.phone}
                              onChange={(event) =>
                                updateEditingRow(key, "phone", event.currentTarget.value)
                              }
                            />
                          </label>
                          <button
                            type="button"
                            disabled={applying || savingKey === key}
                            onClick={() => void saveEditedRow(row)}
                          >
                            Salvar contato e vincular
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {row.status === "new" && edit ? (
                    <div className="import-review-contact import-edit-fields">
                      <label>
                        Nome
                        <input
                          value={edit.name}
                          onChange={(event) =>
                            updateEditingRow(key, "name", event.currentTarget.value)
                          }
                        />
                      </label>
                      <label>
                        Telefone WhatsApp
                        <input
                          inputMode="tel"
                          value={edit.phone}
                          onChange={(event) =>
                            updateEditingRow(key, "phone", event.currentTarget.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={applying || savingKey === key || Boolean(resolution)}
                        onClick={() => void saveEditedRow(row)}
                      >
                        Salvar novo colaborador
                      </button>
                    </div>
                  ) : null}

                  {row.status === "ambiguous" ? (
                    <div className="import-review-contact">
                      <label>
                        Selecione o cadastro correto
                        <select
                          value={selectedCandidateId}
                          disabled={Boolean(resolution)}
                          onChange={(event) =>
                            setCandidateSelections((current) => ({
                              ...current,
                              [key]: event.currentTarget.value,
                            }))
                          }
                        >
                          {row.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name} - {maskImportedPhone(candidate.phone)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={applying || savingKey === key || !selectedCandidate || Boolean(resolution)}
                        onClick={() => {
                          if (selectedCandidate) {
                            void linkCandidate(row, selectedCandidate.id);
                          }
                        }}
                      >
                        Usar contato e vincular
                      </button>
                    </div>
                  ) : null}

                  <div className="import-review-actions">
                    {row.status === "similar_team" && resolution?.included ? (
                      <button type="button" onClick={() => excludeRow(row)}>
                        Não incluir
                      </button>
                    ) : !resolution ? (
                      <button type="button" onClick={() => excludeRow(row)}>
                        Não incluir
                      </button>
                    ) : null}
                  </div>

                  {rowErrors[key] ? (
                    <p className="error import-row-error" role="alert">
                      {rowErrors[key]}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="import-review-footer">
            <p>
              <strong>{includedCount}</strong> colaborador(es) pronto(s).
              {unresolvedCount
                ? ` ${unresolvedCount} item(ns) pendente(s). Novos contatos preenchidos serão salvos e vinculados automaticamente ao aplicar.`
                : " Revisão concluída."}
            </p>
            <div className="actions">
              <button type="button" onClick={cancelImport}>
                Cancelar importação
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  applying ||
                  Boolean(savingKey) ||
                  (unresolvedCount === 0 && includedCount === 0)
                }
                onClick={() => void applyToTeam()}
              >
                {applying ? "Salvando e aplicando..." : "Aplicar à equipe do dia"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <span className="sr-only">
        Seleção anterior preservada: {selectedCollaboratorIds.length} colaborador(es).
      </span>
    </section>
  );
}
