export type ParsedShiftListImport = {
  company: string;
  entryTime: string;
  operationDate: string;
  dispatchTime: string;
  names: string[];
  duplicateNames: string[];
};

export type ImportCompany = {
  id: string;
  nome?: unknown;
  ativa?: unknown;
  ativo?: unknown;
};

export type ImportSchedule = {
  id: string;
  empresa_id?: unknown;
  horario_entrada?: unknown;
  horario_saida?: unknown;
  ativo?: unknown;
};

export type ImportShift = {
  id: string;
  empresa_id?: unknown;
  empresa_horario_id?: unknown;
  ativo?: unknown;
};

export type ImportCollaborator = {
  id: string;
  nome?: unknown;
  telefone?: unknown;
  ativo?: unknown;
};

export type ImportLink = {
  colaborador_id?: unknown;
  empresa_id?: unknown;
  empresa_horario_id?: unknown;
  ativo?: unknown;
};

export type ResolvedImportedOperation = {
  companyId: string;
  scheduleId: string;
  shiftId: string;
  scheduleLabel: string;
};

export type ImportedCollaboratorStatus =
  | "team"
  | "similar_team"
  | "bank"
  | "new"
  | "ambiguous";

export type ImportedCollaboratorCandidate = {
  id: string;
  name: string;
  phone: string;
};

export type ClassifiedImportedCollaborator = {
  importedName: string;
  status: ImportedCollaboratorStatus;
  collaboratorId?: string;
  candidates: ImportedCollaboratorCandidate[];
};

type ResolveImportedOperationInput = {
  companyName: string;
  entryTime: string;
  allowMissingShift?: boolean;
  preferredScheduleId?: string;
  preferredShiftId?: string;
  companies: ImportCompany[];
  schedules: ImportSchedule[];
  shifts: ImportShift[];
};

type ClassifyImportedCollaboratorsInput = {
  names: string[];
  companyId: string;
  scheduleId: string;
  collaborators: ImportCollaborator[];
  links: ImportLink[];
};

export function normalizeImportedName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanImportedShiftListName(value: unknown): string {
  let cleaned = String(value ?? "")
    .trim()
    .replace(/^(?:(?:-|\*|•|✅|✔)\uFE0F?\s*)+/u, "");

  let withoutParentheticalText = cleaned;
  do {
    cleaned = withoutParentheticalText;
    withoutParentheticalText = cleaned.replace(/\s*\([^()]*\)/g, " ");
  } while (withoutParentheticalText !== cleaned);

  return withoutParentheticalText.replace(/\s+/g, " ").trim();
}

function parseBrazilDate(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new Error("Informe uma data válida no formato DD/MM/AAAA.");
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Informe uma data válida no formato DD/MM/AAAA.");
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseTime(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error("Os horários devem usar o formato HH:MM.");
  }
  return value;
}

function isActive(value: unknown): boolean {
  return value !== false;
}

function timePart(value: unknown): string {
  return String(value ?? "").slice(0, 5);
}

const NAME_CONNECTORS = new Set(["da", "das", "de", "do", "dos", "e"]);

function relevantNameParts(value: unknown): string[] {
  return normalizeImportedName(value)
    .split(" ")
    .filter((part) => part && !NAME_CONNECTORS.has(part));
}

function differsByAtMostOneEdit(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}

function hasSingleSmallSpellingVariation(left: string[], right: string[]): boolean {
  if (left.length < 3 || left.length !== right.length) return false;

  let variations = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    if (!differsByAtMostOneEdit(left[index], right[index])) return false;
    variations += 1;
  }

  return variations === 1;
}

function isProbableTeamName(importedName: string, registeredName: unknown): boolean {
  const importedParts = relevantNameParts(importedName);
  const registeredParts = relevantNameParts(registeredName);

  if (importedParts.length < 2 || registeredParts.length < 2) return false;

  const importedSet = new Set(importedParts);
  const registeredSet = new Set(registeredParts);
  const commonParts = [...importedSet].filter((part) => registeredSet.has(part));
  const shorterSize = Math.min(importedSet.size, registeredSet.size);
  const longerSize = Math.max(importedSet.size, registeredSet.size);
  const isUniqueAbbreviation =
    importedParts[0] === registeredParts[0] &&
    commonParts.length === shorterSize &&
    commonParts.length / longerSize >= 2 / 3;

  return (
    isUniqueAbbreviation ||
    hasSingleSmallSpellingVariation(importedParts, registeredParts)
  );
}

export function parseShiftListImport(value: string): ParsedShiftListImport {
  const lines = String(value ?? "").split(/\r?\n/);
  const header = lines.shift()?.trim() ?? "";
  const match = header.match(
    /^Empresa:\s*(.+?)\s*;\s*Entrada:\s*(\d{2}:\d{2})\s*;\s*Data:\s*(\d{2}\/\d{2}\/\d{4})\s*;\s*Disparo:\s*(\d{2}:\d{2})\s*$/i,
  );

  if (!match) {
    throw new Error(
      "Mantenha no cabeçalho Empresa, Entrada, Data e Disparo, nesta ordem.",
    );
  }

  const uniqueNames = new Map<string, string>();
  const duplicateNames: string[] = [];

  for (const rawName of lines) {
    const name = cleanImportedShiftListName(rawName);
    const normalizedName = normalizeImportedName(name);
    if (!normalizedName) continue;

    if (uniqueNames.has(normalizedName)) {
      duplicateNames.push(name);
    } else {
      uniqueNames.set(normalizedName, name);
    }
  }

  if (!uniqueNames.size) {
    throw new Error("Informe pelo menos um colaborador.");
  }

  return {
    company: match[1].trim(),
    entryTime: parseTime(match[2]),
    operationDate: parseBrazilDate(match[3]),
    dispatchTime: parseTime(match[4]),
    names: [...uniqueNames.values()],
    duplicateNames,
  };
}

export function resolveImportedOperation(
  input: ResolveImportedOperationInput,
): ResolvedImportedOperation {
  const normalizedCompany = normalizeImportedName(input.companyName);
  const companyMatches = input.companies.filter(
    (item) =>
      isActive(item.ativa ?? item.ativo) &&
      normalizeImportedName(item.nome) === normalizedCompany,
  );

  if (companyMatches.length === 0) {
    throw new Error(`A empresa "${input.companyName}" não foi encontrada.`);
  }

  const companyIds = new Set(companyMatches.map((company) => company.id));
  const scheduleMatches = input.schedules.filter(
    (item) =>
      isActive(item.ativo) &&
      companyIds.has(String(item.empresa_id)) &&
      timePart(item.horario_entrada) === input.entryTime,
  );

  if (scheduleMatches.length === 0) {
    throw new Error(
      `Não existe uma entrada às ${input.entryTime} cadastrada para ${input.companyName}.`,
    );
  }

  const resolvedOptions = scheduleMatches.flatMap((schedule) =>
    input.shifts
      .filter(
        (item) =>
          isActive(item.ativo) &&
          String(item.empresa_id) === String(schedule.empresa_id) &&
          String(item.empresa_horario_id) === schedule.id,
      )
      .map((shift) => ({ schedule, shift })),
  );

  if (resolvedOptions.length === 0) {
    const preferredSchedule = input.preferredScheduleId
      ? scheduleMatches.find((schedule) => schedule.id === input.preferredScheduleId)
      : undefined;
    const schedule = preferredSchedule ?? (scheduleMatches.length === 1 ? scheduleMatches[0] : undefined);

    if (input.allowMissingShift && schedule) {
      return {
        companyId: String(schedule.empresa_id),
        scheduleId: schedule.id,
        shiftId: "",
        scheduleLabel: `${timePart(schedule.horario_entrada)} as ${timePart(schedule.horario_saida)}`,
      };
    }
    throw new Error("Não existe um turno ativo para essa empresa e entrada.");
  }

  const preferredScheduleOptions = input.preferredScheduleId
    ? resolvedOptions.filter(({ schedule }) => schedule.id === input.preferredScheduleId)
    : [];
  const scheduleScopedOptions = preferredScheduleOptions.length
    ? preferredScheduleOptions
    : resolvedOptions;
  const preferredShiftOption = input.preferredShiftId
    ? scheduleScopedOptions.find(({ shift }) => shift.id === input.preferredShiftId)
    : undefined;
  const selectedOptions = preferredShiftOption
    ? [preferredShiftOption]
    : scheduleScopedOptions;
  const scheduleIds = new Set(selectedOptions.map(({ schedule }) => schedule.id));

  if (scheduleIds.size > 1) {
    throw new Error(
      "Há mais de um turno ativo para essa empresa e jornada. Revise os turnos cadastrados.",
    );
  }

  const [{ schedule }] = selectedOptions;
  const shift = [...selectedOptions]
    .map((option) => option.shift)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  return {
    companyId: String(schedule.empresa_id),
    scheduleId: schedule.id,
    shiftId: shift.id,
    scheduleLabel: `${timePart(schedule.horario_entrada)} as ${timePart(schedule.horario_saida)}`,
  };
}

export function classifyImportedCollaborators(
  input: ClassifyImportedCollaboratorsInput,
): ClassifiedImportedCollaborator[] {
  const collaboratorsByName = new Map<string, ImportCollaborator[]>();
  const activeCollaborators: ImportCollaborator[] = [];

  for (const collaborator of input.collaborators) {
    if (!isActive(collaborator.ativo)) continue;
    activeCollaborators.push(collaborator);
    const normalizedName = normalizeImportedName(collaborator.nome);
    if (!normalizedName) continue;
    const matches = collaboratorsByName.get(normalizedName) ?? [];
    matches.push(collaborator);
    collaboratorsByName.set(normalizedName, matches);
  }

  const teamCollaboratorIds = new Set(
    input.links
      .filter(
        (link) =>
          isActive(link.ativo) &&
          String(link.empresa_id) === input.companyId &&
          String(link.empresa_horario_id) === input.scheduleId,
      )
      .map((link) => String(link.colaborador_id)),
  );

  return input.names.map((importedName) => {
    const matches = collaboratorsByName.get(normalizeImportedName(importedName)) ?? [];
    const candidates = matches.map((item) => ({
      id: item.id,
      name: String(item.nome ?? importedName),
      phone: String(item.telefone ?? ""),
    }));

    if (matches.length === 0) {
      const probableTeamMatches = activeCollaborators.filter(
        (collaborator) =>
          teamCollaboratorIds.has(collaborator.id) &&
          isProbableTeamName(importedName, collaborator.nome),
      );
      const probableCandidates = probableTeamMatches.map((item) => ({
        id: item.id,
        name: String(item.nome ?? importedName),
        phone: String(item.telefone ?? ""),
      }));

      if (probableTeamMatches.length === 1) {
        return {
          importedName,
          status: "similar_team",
          collaboratorId: probableTeamMatches[0].id,
          candidates: probableCandidates,
        };
      }

      if (probableTeamMatches.length > 1) {
        return {
          importedName,
          status: "ambiguous",
          candidates: probableCandidates,
        };
      }

      return { importedName, status: "new", candidates };
    }

    if (matches.length > 1) {
      return { importedName, status: "ambiguous", candidates };
    }

    const collaboratorId = matches[0].id;
    const isOnTeam = input.links.some(
      (link) =>
        isActive(link.ativo) &&
        String(link.colaborador_id) === collaboratorId &&
        String(link.empresa_id) === input.companyId &&
        String(link.empresa_horario_id) === input.scheduleId,
    );

    return {
      importedName,
      collaboratorId,
      status: isOnTeam ? "team" : "bank",
      candidates,
    };
  });
}
