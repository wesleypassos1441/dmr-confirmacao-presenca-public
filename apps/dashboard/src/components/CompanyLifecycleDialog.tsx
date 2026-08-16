"use client";

import { useState } from "react";

export type CompanyLifecycleAction = "desativar" | "reativar" | "encerrar_contrato";

type CompanyLifecycleDialogProps = {
  open: boolean;
  companyName: string;
  action: CompanyLifecycleAction;
  onClose: () => void;
  onConfirm: (observation: string) => Promise<boolean | void>;
};

const actionContent = {
  desativar: {
    title: "Desativar empresa",
    description: "A empresa deixará de aparecer nos novos cadastros e poderá ser reativada depois.",
    confirm: "Desativar",
  },
  reativar: {
    title: "Reativar empresa",
    description: "A empresa voltará a aparecer nos seletores operacionais.",
    confirm: "Reativar",
  },
  encerrar_contrato: {
    title: "Encerrar contrato",
    description: "A empresa e suas equipes sairão da operação, mas todo o histórico e os relatórios serão preservados.",
    confirm: "Encerrar contrato",
  },
} as const;

export function CompanyLifecycleDialog({ open, companyName, action, onClose, onConfirm }: CompanyLifecycleDialogProps) {
  const [observation, setObservation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;
  const content = actionContent[action];

  async function confirm() {
    setSubmitting(true);
    setError("");
    try {
      const saved = await onConfirm(observation.trim());
      if (saved !== false) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a situação da empresa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="company-lifecycle-title">
        <header>
          <h2 id="company-lifecycle-title">{content.title}</h2>
          <p><strong>{companyName}</strong></p>
          <p>{content.description}</p>
        </header>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <label>
          Motivo ou observação (opcional)
          <textarea rows={4} value={observation} onChange={(event) => setObservation(event.currentTarget.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="button" className={action === "reativar" ? "primary" : "danger"} onClick={() => void confirm()} disabled={submitting}>
            {submitting ? "Salvando..." : content.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

