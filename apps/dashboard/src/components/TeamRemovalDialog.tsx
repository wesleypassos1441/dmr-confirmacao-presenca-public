"use client";

import { useState } from "react";

type TeamRemovalDialogProps = {
  open: boolean;
  collaboratorName: string;
  companyName: string;
  onClose: () => void;
  onConfirm: (observation: string) => Promise<boolean | void>;
};

export function TeamRemovalDialog({ open, collaboratorName, companyName, onClose, onConfirm }: TeamRemovalDialogProps) {
  const [observation, setObservation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  async function confirm() {
    setSubmitting(true);
    setError("");
    try {
      const saved = await onConfirm(observation.trim());
      if (saved !== false) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o colaborador da empresa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="team-removal-title">
        <header>
          <h2 id="team-removal-title">Remover da empresa</h2>
          <p>Esta ação remove {collaboratorName} da equipe de {companyName}, mas não apaga o contato do banco de colaboradores.</p>
        </header>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <label>
          Observação (opcional)
          <textarea rows={4} value={observation} onChange={(event) => setObservation(event.currentTarget.value)} placeholder="Ex.: contrato encerrado, mudança de disponibilidade..." />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="button" className="danger" onClick={() => void confirm()} disabled={submitting}>
            {submitting ? "Removendo..." : "Confirmar remoção"}
          </button>
        </div>
      </section>
    </div>
  );
}

