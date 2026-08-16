export type WeeklyScheduleRule = {
  weekday: number;
  entrada: string;
  saida: string;
  active?: boolean;
};

export function propagateScheduleDefault<T extends WeeklyScheduleRule>(
  rules: T[],
  field: "entrada" | "saida",
  value: string,
): T[] {
  return rules.map((rule) => ({ ...rule, [field]: value }));
}

