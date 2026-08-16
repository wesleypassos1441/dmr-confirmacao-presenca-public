"use client";

export type CollaboratorHistoryItem = {
  id: string;
  tipo: string;
  ocorrido_em: string;
  empresa_nome_snapshot: string;
  jornada_snapshot?: string | null;
  observacao?: string | null;
};

type CollaboratorHistoryDialogProps = {
  open: boolean;
  collaboratorName: string;
  items: CollaboratorHistoryItem[];
  onClose: () => void;
};

const labels: Record<string, string> = {
  adicionado: "Adicionado à equipe",
  removido: "Removido da equipe",
  realocado_saida: "Realocado desta equipe",
  realocado_entrada: "Realocado para esta equipe",
  contrato_encerrado: "Vínculo encerrado com o contrato da empresa",
};

export function CollaboratorHistoryDialog({ open, collaboratorName, items, onClose }: CollaboratorHistoryDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="collaborator-history-title">
        <header>
          <h2 id="collaborator-history-title">Histórico profissional</h2>
          <p>{collaboratorName}</p>
        </header>
        <div className="history-timeline">
          {items.length ? items.map((item) => (
            <article className="history-item" key={item.id}>
              <time>{new Date(item.ocorrido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time>
              <strong>{labels[item.tipo] ?? item.tipo}</strong>
              <span>{item.empresa_nome_snapshot}{item.jornada_snapshot ? ` - ${item.jornada_snapshot}` : ""}</span>
              {item.observacao ? <p>{item.observacao}</p> : null}
            </article>
          )) : <p>Nenhuma movimentação registrada.</p>}
        </div>
        <div className="modal-actions"><button type="button" onClick={onClose}>Fechar</button></div>
      </section>
    </div>
  );
}

