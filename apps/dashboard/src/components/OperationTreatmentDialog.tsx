"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export type OperationTreatmentPayload = {
  recordId: string;
  markFalsePositive: boolean;
  motivo: string;
  substitutoNome: string;
};

type OperationTreatmentDialogProps = {
  open: boolean;
  record: {
    id: string;
    collaboratorName: string;
    companyName: string;
    falsePositiveAt?: string | null;
    reason?: string | null;
    substituteName?: string | null;
  };
  onClose: () => void;
  onSave: (payload: OperationTreatmentPayload) => Promise<boolean | void>;
};

export function OperationTreatmentDialog({ open, record, onClose, onSave }: OperationTreatmentDialogProps) {
  const [markFalsePositive, setMarkFalsePositive] = useState(Boolean(record.falsePositiveAt));
  const [motivo, setMotivo] = useState(record.reason ?? "");
  const [substitutoNome, setSubstitutoNome] = useState(record.substituteName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (markFalsePositive && substitutoNome.trim() && substitutoNome.trim().length < 2) {
      setError("Informe o nome completo do substituto ou deixe o campo vazio.");
      return;
    }

    setSubmitting(true);
    try {
      const saved = await onSave({
        recordId: record.id,
        markFalsePositive,
        motivo: motivo.trim(),
        substitutoNome: substitutoNome.trim(),
      });
      if (saved !== false) onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o tratamento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="operation-treatment-title">
        <header>
          <h2 id="operation-treatment-title">Tratar confirmação</h2>
          <p>{record.collaboratorName} · {record.companyName}</p>
        </header>
        <form className="grid" onSubmit={submit}>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={markFalsePositive}
              onChange={(event) => setMarkFalsePositive(event.currentTarget.checked)}
            />
            Falso positivo: confirmou, mas depois informou que não poderá comparecer
          </label>
          {markFalsePositive ? (
            <>
              <label>
                Motivo ou observação
                <textarea value={motivo} onChange={(event) => setMotivo(event.currentTarget.value)} rows={3} />
              </label>
              <label>
                Colaborador substituto (opcional)
                <input value={substitutoNome} onChange={(event) => setSubstitutoNome(event.currentTarget.value)} />
              </label>
              <p className="schedule-impact">A confirmação e a resposta originais continuarão registradas no histórico.</p>
            </>
          ) : record.falsePositiveAt ? (
            <p className="schedule-impact">Ao salvar, o falso positivo e o substituto deste tratamento serão removidos. A confirmação original será mantida.</p>
          ) : null}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar tratamento"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
