"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { propagateScheduleDefault } from "../lib/schedule-rules";

export type ScheduleRuleInput = {
  weekday: number;
  entrada: string;
  saida: string;
  active?: boolean;
};

export type ScheduleEditorPayload = {
  scheduleId: string;
  entrada: string;
  saida: string;
  rules: ScheduleRuleInput[];
};

type ScheduleEditorProps = {
  open: boolean;
  companyName: string;
  schedule: { id: string; entrada: string; saida: string };
  rules: ScheduleRuleInput[];
  futureOperations?: number;
  onClose: () => void;
  onSave: (payload: ScheduleEditorPayload) => Promise<boolean | void>;
};

const weekdays = [
  [1, "Segunda-feira"],
  [2, "Terça-feira"],
  [3, "Quarta-feira"],
  [4, "Quinta-feira"],
  [5, "Sexta-feira"],
  [6, "Sábado"],
  [7, "Domingo"],
] as const;

function initialRules(schedule: ScheduleEditorProps["schedule"], rules: ScheduleRuleInput[]): ScheduleRuleInput[] {
  return weekdays.map(([weekday]) => {
    const current = rules.find((item) => item.weekday === weekday);
    return {
      weekday,
      entrada: current?.entrada || schedule.entrada,
      saida: current?.saida || schedule.saida,
      active: current?.active ?? Boolean(current),
    };
  });
}

export function ScheduleEditor({
  open,
  companyName,
  schedule,
  rules,
  futureOperations = 0,
  onClose,
  onSave,
}: ScheduleEditorProps) {
  const [entrada, setEntrada] = useState(schedule.entrada);
  const [saida, setSaida] = useState(schedule.saida);
  const [weeklyRules, setWeeklyRules] = useState(() => initialRules(schedule, rules));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function updateRule(weekday: number, patch: Partial<ScheduleRuleInput>) {
    setWeeklyRules((current) => current.map((rule) => rule.weekday === weekday ? { ...rule, ...patch } : rule));
  }

  function updateDefault(field: "entrada" | "saida", value: string) {
    if (field === "entrada") setEntrada(value);
    else setSaida(value);
    setWeeklyRules((current) => propagateScheduleDefault(current, field, value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!entrada || !saida) {
      setError("Informe a entrada e a saída da jornada padrão.");
      return;
    }
    if (weeklyRules.some((rule) => rule.active && (!rule.entrada || !rule.saida))) {
      setError("Informe entrada e saída para todos os dias ativos.");
      return;
    }

    setSubmitting(true);
    try {
      const saved = await onSave({ scheduleId: schedule.id, entrada, saida, rules: weeklyRules });
      if (saved !== false) onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a jornada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title">
        <header>
          <h2 id="schedule-editor-title">Editar jornada</h2>
          <p>{companyName}</p>
        </header>

        <form onSubmit={submit} className="grid">
          {error ? <p className="error" role="alert">{error}</p> : null}

          <div className="schedule-base-fields">
            <label>
              Entrada padrão
              <input type="time" value={entrada} onChange={(event) => updateDefault("entrada", event.currentTarget.value)} required />
            </label>
            <label>
              Saída padrão
              <input type="time" value={saida} onChange={(event) => updateDefault("saida", event.currentTarget.value)} required />
            </label>
          </div>

          <div className="weekly-schedule-list" aria-label="Regras por dia da semana">
            {weekdays.map(([weekday, label]) => {
              const rule = weeklyRules.find((item) => item.weekday === weekday)!;
              return (
                <div className="weekly-schedule-row" key={weekday}>
                  <label className="weekly-day-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(rule.active)}
                      onChange={(event) => updateRule(weekday, { active: event.currentTarget.checked })}
                    />
                    <span>{label}</span>
                  </label>
                  <label>
                    Entrada
                    <input
                      type="time"
                      value={rule.entrada}
                      disabled={!rule.active}
                      onChange={(event) => updateRule(weekday, { entrada: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    Saída
                    <input
                      type="time"
                      value={rule.saida}
                      disabled={!rule.active}
                      onChange={(event) => updateRule(weekday, { saida: event.currentTarget.value })}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <p className="schedule-impact">
            {futureOperations > 0
              ? `${futureOperations} operação(ões) já criada(s) manterão os horários registrados.`
              : "Operações já criadas mantêm os horários registrados no momento da programação."}
          </p>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar jornada"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
