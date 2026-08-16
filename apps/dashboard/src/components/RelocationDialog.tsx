"use client";

import { useMemo, useState } from "react";
import type { RelocationDestination } from "../lib/operations";

export type RelocationResult = {
  moved: number;
  alreadyThere: number;
  hadSentMessages: boolean;
};

export type RelocationDialogProps = {
  open: boolean;
  mode: "permanent" | "date";
  origin: string;
  selectedIds: string[];
  destinations: RelocationDestination[];
  onConfirm: (destinationId: string) => Promise<RelocationResult>;
  onPrepareAnnouncement?: (destinationId: string) => void;
  onClose: () => void;
};

export function RelocationDialog({
  open,
  mode,
  origin,
  selectedIds,
  destinations,
  onConfirm,
  onPrepareAnnouncement,
  onClose,
}: RelocationDialogProps) {
  const [destinationId, setDestinationId] = useState(destinations[0]?.scheduleId ?? "");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<RelocationResult | null>(null);
  const [dialogError, setDialogError] = useState("");
  const effectiveDestinationId = destinations.some((item) => item.scheduleId === destinationId)
    ? destinationId
    : (destinations[0]?.scheduleId ?? "");
  const destination = useMemo(
    () => destinations.find((item) => item.scheduleId === effectiveDestinationId),
    [effectiveDestinationId, destinations],
  );

  if (!open) return null;

  async function confirm() {
    if (!effectiveDestinationId || !selectedIds.length) {
      setDialogError("Selecione os colaboradores e o destino da realocação.");
      return;
    }
    setDialogError("");
    setSaving(true);
    try {
      setResult(await onConfirm(effectiveDestinationId));
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : (typeof error === "object" && error && "message" in error && typeof error.message === "string" ? error.message : "");
      setDialogError(detail
        ? `Não foi possível realocar os colaboradores. ${detail}`
        : "Não foi possível realocar os colaboradores.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="relocation-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{mode === "permanent" ? "Equipe fixa" : "Operação do dia"}</span>
            <h2 id="relocation-title">Realocar colaboradores</h2>
          </div>
          <button type="button" className="icon" aria-label="Fechar" onClick={onClose}>×</button>
        </div>

        {!result ? (
          <div className="grid">
            <div className="dialog-summary">
              <span>Origem</span><strong>{origin}</strong>
              <span>Selecionados</span><strong>{selectedIds.length}</strong>
              <span>Vigência</span><strong>{mode === "permanent" ? "Próximas operações" : "Somente nesta data"}</strong>
            </div>
            <label>
              Destino
              <select value={effectiveDestinationId} onChange={(event) => { setDestinationId(event.currentTarget.value); setDialogError(""); }}>
                {destinations.map((item) => (
                  <option key={item.scheduleId} value={item.scheduleId}>{item.company} - {item.label}</option>
                ))}
              </select>
            </label>
            {!destinations.length ? <p className="error">Cadastre outro horário antes de realocar a equipe.</p> : null}
            {dialogError ? <p className="error" role="alert">{dialogError}</p> : null}
            <div className="actions dialog-actions">
              <button type="button" onClick={onClose}>Cancelar</button>
              <button type="button" className="primary" disabled={saving || !effectiveDestinationId} onClick={() => void confirm()}>
                {saving ? "Realocando..." : "Confirmar realocação"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid">
            <p><strong>{result.moved}</strong> colaborador(es) realocado(s) para {destination?.company} - {destination?.label}.</p>
            {result.alreadyThere ? <p>{result.alreadyThere} já estavam no destino e não foram duplicados.</p> : null}
            {result.hadSentMessages ? (
              <p className="warning">Já havia mensagens enviadas. O histórico foi preservado; prepare um comunicado caso precise avisar a mudança.</p>
            ) : null}
            <div className="actions dialog-actions">
              {result.hadSentMessages && onPrepareAnnouncement ? (
                <button type="button" onClick={() => onPrepareAnnouncement(effectiveDestinationId)}>Preparar comunicado</button>
              ) : null}
              <button type="button" className="primary" onClick={onClose}>Concluir</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
