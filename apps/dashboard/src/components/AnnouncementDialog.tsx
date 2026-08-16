"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  announcementRecipients,
  renderAnnouncement,
  validateAnnouncementTemplate,
} from "../lib/announcements";
import type { AnnouncementAudience } from "../lib/announcements";

export type AnnouncementRecipient = {
  id: string;
  name: string;
  status: string;
};

export type AnnouncementPayload = {
  scheduleId: string;
  subject: string;
  body: string;
  scheduledAt: string;
  recipientIds: string[];
};

type AnnouncementDialogProps = {
  open: boolean;
  company: string;
  schedule: string;
  scheduleId: string;
  operationDate: string;
  recipients: AnnouncementRecipient[];
  onClose: () => void;
  onConfirm: (payload: AnnouncementPayload) => Promise<boolean | void>;
};

function defaultSchedule() {
  const date = new Date(Date.now() + 5 * 60_000);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function brazilianDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function AnnouncementDialog({
  open,
  company,
  schedule,
  scheduleId,
  operationDate,
  recipients,
  onClose,
  onConfirm,
}: AnnouncementDialogProps) {
  const [audience, setAudience] = useState<AnnouncementAudience>("todos");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("Aviso operacional");
  const [body, setBody] = useState("Olá {nome}. Temos um aviso sobre a empresa {empresa} em {data}, no horário {horario}.");
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const recipientIds = useMemo(
    () => announcementRecipients(recipients.map((item) => ({ id: item.id, status: item.status })), audience, selectedIds),
    [audience, recipients, selectedIds],
  );
  const previewRecipient = recipients.find((item) => recipientIds.includes(item.id)) ?? recipients[0];
  const preview = previewRecipient
    ? `*${subject.trim()}*\n\n${renderAnnouncement(body, {
      nome: previewRecipient.name,
      empresa: company,
      data: brazilianDate(operationDate),
      horario: schedule,
    })}`
    : "Selecione ao menos um colaborador para visualizar.";

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validation = validateAnnouncementTemplate(body);
    if (!validation.valid) {
      setError(validation.unknown.length
        ? `Variável não permitida: ${validation.unknown.map((item) => `{${item}}`).join(", ")}.`
        : "Escreva a mensagem do comunicado.");
      return;
    }
    if (subject.trim().length < 2) {
      setError("Informe o assunto do comunicado.");
      return;
    }
    if (!recipientIds.length) {
      setError("Selecione pelo menos um destinatário.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await onConfirm({
        scheduleId,
        subject: subject.trim(),
        body: body.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        recipientIds,
      });
      if (result !== false) onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível criar o comunicado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal announcement-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
        <header>
          <h2 id="announcement-title">Criar comunicado</h2>
          <p>{company} · {schedule} · {brazilianDate(operationDate)}</p>
        </header>
        <form className="grid" onSubmit={submit}>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <label>
            Destinatários
            <select value={audience} onChange={(event) => setAudience(event.currentTarget.value as AnnouncementAudience)}>
              <option value="todos">Todos da operação</option>
              <option value="pendentes">Somente pendentes</option>
              <option value="manual">Seleção manual</option>
            </select>
          </label>
          {audience === "manual" ? (
            <div className="announcement-recipients" aria-label="Seleção manual de destinatários">
              {recipients.map((recipient) => (
                <label className="inline-check" key={recipient.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(recipient.id)}
                    onChange={(event) => setSelectedIds((current) => event.currentTarget.checked
                      ? [...current, recipient.id]
                      : current.filter((id) => id !== recipient.id))}
                  />
                  {recipient.name}
                </label>
              ))}
            </div>
          ) : null}
          <div className="form-grid two-cols">
            <label>
              Assunto
              <input value={subject} maxLength={120} onChange={(event) => setSubject(event.currentTarget.value)} />
            </label>
            <label>
              Enviar em
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.currentTarget.value)} />
            </label>
          </div>
          <label>
            Mensagem
            <textarea rows={6} maxLength={2000} value={body} onChange={(event) => setBody(event.currentTarget.value)} />
          </label>
          <p className="status-line">Variáveis disponíveis: {`{nome}`}, {`{empresa}`}, {`{data}`} e {`{horario}`}.</p>
          <div className="announcement-preview">
            <span className="eyebrow">Pré-visualização · {recipientIds.length} destinatário(s)</span>
            <pre>{preview}</pre>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Colocando na fila..." : "Confirmar comunicado"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
