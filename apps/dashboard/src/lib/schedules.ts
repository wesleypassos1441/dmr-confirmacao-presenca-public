export type ScheduleSource = "exception" | "weekly" | "base";

export type TimeRange = {
  entrada: string;
  saida: string;
};

export type WeeklyRule = TimeRange & {
  weekday: number;
};

export type DateException = TimeRange & {
  date: string;
};

export function resolveEffectiveSchedule(input: {
  date: string;
  base: TimeRange;
  weekly: WeeklyRule[];
  exceptions: DateException[];
}): TimeRange & { source: ScheduleSource } {
  const exception = input.exceptions.find((item) => item.date === input.date);
  if (exception) {
    return {
      entrada: exception.entrada,
      saida: exception.saida,
      source: "exception",
    };
  }

  const weekday = new Date(`${input.date}T12:00:00Z`).getUTCDay() || 7;
  const weekly = input.weekly.find((item) => item.weekday === weekday);
  if (weekly) {
    return {
      entrada: weekly.entrada,
      saida: weekly.saida,
      source: "weekly",
    };
  }

  return { ...input.base, source: "base" };
}
