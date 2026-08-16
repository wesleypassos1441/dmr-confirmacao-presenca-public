"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export type ScheduleExceptionPayload = {
  scheduleId: string;
  date: string;
  entrada: string;
  saida: string;
  motivo: string;
  prepareAnnouncement: boolean;
};

type ScheduleExceptionDialogProps = {
  open: boolean;
  companyName: string;
  schedule: { id: string; entrada: string; saida: string };
  minDate: string;
  initialDate?: string;
  onClose: () => void;
  onSave: (payload: ScheduleExceptionPayload) => Promise<boolean | void>;
};

export function ScheduleExceptionDialog({
  open,
  companyName,
  schedule,
  minDate,
  initialDate,
  onClose,
  onSave,
}: ScheduleExceptionDialogProps) {
  const [date, setDate] = useState(initialDate || minDate);
  const [entrada, setEntrada] = useState(schedule.entrada);
  const [saida, setSaida] = useState(schedule.saida);
  const [motivo, setMotivo] = useState("");
  const [prepareAnnouncement, setPrepareAnnouncement] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!date || !entrada || !saida) {
      setError("Informe data, entrada e saída da exceção.");
      return;
    }
    if (date < minDate) {
      setError("A data da exceção não pode estar no passado.");
      return;
    }

    setSubmitting(true);
    try {
      const saved = await onSave({ scheduleId: schedule.id, date, entrada, saida, motivo, prepareAnnouncement });
      if (saved !== false) onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a exceção.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal schedule-exception-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-exception-title">
        <header>
          <h2 id="schedule-exception-title">Exceção de horário</h2>
          <p>{companyName}</p>
        </header>

        <form onSubmit={submit} className="grid">
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="schedule-exception-fields">
            <label>
              Data
              <input type="date" min={minDate} value={date} onChange={(event) => setDate(event.currentTarget.value)} required />
            </label>
            <label>
              Entrada excepcional
              <input type="time" value={entrada} onChange={(event) => setEntrada(event.currentTarget.value)} required />
            </label>
            <label>
              Saída excepcional
              <input type="time" value={saida} onChange={(event) => setSaida(event.currentTarget.value)} required />
            </label>
          </div>
          <label>
            Motivo ou observação
            <input value={motivo} onChange={(event) => setMotivo(event.currentTarget.value)} placeholder="Ex.: horário especial de sexta-feira" />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={prepareAnnouncement}
              onChange={(event) => setPrepareAnnouncement(event.currentTarget.checked)}
            />
            Preparar comunicado para os colaboradores após salvar
          </label>
          <p className="schedule-impact">A exceção vale somente para a data escolhida. A jornada semanal continua inalterada.</p>
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar exceção"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
