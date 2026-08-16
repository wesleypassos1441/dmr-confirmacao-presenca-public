import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyImportedCollaborators,
  normalizeImportedName,
  parseShiftListImport,
  resolveImportedOperation,
} from "../apps/dashboard/src/lib/shift-list-import.ts";

const validList = `Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

Hugo Octávio Souza de Oliveira
Gabriel Silva da Cruz
Rafael Christian de Oliveira Souza
Warley Thiago da Silva`;

test("interpreta cabecalho e nomes no formato aprovado", () => {
  assert.deepEqual(parseShiftListImport(validList), {
    company: "Sete Lagos",
    entryTime: "12:00",
    operationDate: "2026-07-31",
    dispatchTime: "09:00",
    names: [
      "Hugo Octávio Souza de Oliveira",
      "Gabriel Silva da Cruz",
      "Rafael Christian de Oliveira Souza",
      "Warley Thiago da Silva",
    ],
    duplicateNames: [],
  });
});

test("ignora marcadores e observacoes entre parenteses na lista de nomes", () => {
  const result = parseShiftListImport(`Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

- Isaque Gonçalves do Nascimento (Líder)
• Pessoa Exemplo H
✅ Arthur Barbosa Martins de Souza
- ✅ Vitor Fernandes Dias de Oliveira (Apoio) (Temporário)
Pessoa Exemplo Santos Reiss
Pessoa Exemplo Silva Santoss`);

  assert.deepEqual(result.names, [
    "Isaque Gonçalves do Nascimento",
    "Pessoa Exemplo H",
    "Arthur Barbosa Martins de Souza",
    "Vitor Fernandes Dias de Oliveira",
    "Pessoa Exemplo Santos Reiss",
    "Pessoa Exemplo Silva Santoss",
  ]);
  assert.deepEqual(result.duplicateNames, []);
});

test("ignora asterisco no modelo de Sete Lagos", () => {
  const result = parseShiftListImport(`Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 04/08/2026 ; Disparo: 09:00

* Adrian Alexandre Pereira de Oliveira
* Gabriel Silva da cruz
* Pedro Afonso de jesus
* Pessoa Exemplo Oliveira
* Rômulo da Silva Menezes`);

  assert.deepEqual(result.names, [
    "Adrian Alexandre Pereira de Oliveira",
    "Gabriel Silva da cruz",
    "Pedro Afonso de jesus",
    "Pessoa Exemplo Oliveira",
    "Rômulo da Silva Menezes",
  ]);
  assert.deepEqual(result.duplicateNames, []);
});

test("considera repetidos depois de remover marcador e parenteses", () => {
  const result = parseShiftListImport(`Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

- Isaque Gonçalves do Nascimento (Líder)
✅ Isaque Goncalves do Nascimento (Reserva)`);

  assert.deepEqual(result.names, ["Isaque Gonçalves do Nascimento"]);
  assert.deepEqual(result.duplicateNames, ["Isaque Goncalves do Nascimento"]);
});

test("normaliza somente para comparacao sem alterar o original", () => {
  assert.equal(normalizeImportedName("  PESSOA EXEMPLO I "), "hugo octavio souza");
});

test("remove nomes repetidos e informa as repeticoes", () => {
  const result = parseShiftListImport(`${validList}\nHugo Octavio Souza de Oliveira`);
  assert.equal(result.names.length, 4);
  assert.deepEqual(result.duplicateNames, ["Hugo Octavio Souza de Oliveira"]);
});

test("rejeita cabecalho incompleto ou fora de ordem", () => {
  assert.throws(
    () =>
      parseShiftListImport(
        "Empresa: Sete Lagos ; Data: 31/07/2026 ; Entrada: 12:00 ; Disparo: 09:00\nHugo",
      ),
    /Empresa, Entrada, Data e Disparo/,
  );
});

test("rejeita data brasileira inexistente", () => {
  assert.throws(
    () =>
      parseShiftListImport(
        "Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/02/2026 ; Disparo: 09:00\nHugo",
      ),
    /data válida/,
  );
});

test("rejeita horarios invalidos e lista vazia", () => {
  assert.throws(
    () =>
      parseShiftListImport(
        "Empresa: Sete Lagos ; Entrada: 25:00 ; Data: 31/07/2026 ; Disparo: 09:00\nHugo",
      ),
    /HH:MM/,
  );
  assert.throws(
    () =>
      parseShiftListImport(
        "Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00",
      ),
    /pelo menos um colaborador/,
  );
});

const companies = [{ id: "company-1", nome: "Sete Lágos", ativa: true }];
const schedules = [
  {
    id: "schedule-1",
    empresa_id: "company-1",
    horario_entrada: "12:00:00",
    horario_saida: "21:00:00",
    ativo: true,
  },
];
const shifts = [
  {
    id: "shift-1",
    empresa_id: "company-1",
    empresa_horario_id: "schedule-1",
    ativo: true,
  },
];

test("resolve empresa, jornada e turno ignorando acentos e caixa", () => {
  assert.deepEqual(
    resolveImportedOperation({
      companyName: "sete lagos",
      entryTime: "12:00",
      companies,
      schedules,
      shifts,
    }),
    {
      companyId: "company-1",
      scheduleId: "schedule-1",
      shiftId: "shift-1",
      scheduleLabel: "12:00 as 21:00",
    },
  );
});

test("resolve empresa agrupada mesmo com registros historicos duplicados", () => {
  assert.deepEqual(
    resolveImportedOperation({
      companyName: "Sete Lagos",
      entryTime: "12:00",
      companies: [
        { id: "empresa-antiga", nome: "Sete Lagos", ativa: true },
        { id: "empresa-atual", nome: "SETE LAGOS", ativa: true },
      ],
      schedules: [
        {
          id: "horario-atual",
          empresa_id: "empresa-atual",
          horario_entrada: "12:00:00",
          horario_saida: "21:00:00",
          ativo: true,
        },
      ],
      shifts: [
        {
          id: "turno-atual",
          empresa_id: "empresa-atual",
          empresa_horario_id: "horario-atual",
          ativo: true,
        },
      ],
    }),
    {
      companyId: "empresa-atual",
      scheduleId: "horario-atual",
      shiftId: "turno-atual",
      scheduleLabel: "12:00 as 21:00",
    },
  );
});

test("prioriza a jornada selecionada quando existem registros historicos equivalentes", () => {
  assert.deepEqual(
    resolveImportedOperation({
      companyName: "PlayVender - São Mateus",
      entryTime: "11:00",
      preferredScheduleId: "horario-selecionado-11",
      preferredShiftId: "turno-anterior",
      companies: [
        { id: "empresa-anterior", nome: "PlayVender - São Mateus", ativa: true },
        { id: "empresa-atual", nome: "PlayVender - São Mateus", ativa: true },
      ],
      schedules: [
        {
          id: "horario-anterior-11",
          empresa_id: "empresa-anterior",
          horario_entrada: "11:00:00",
          horario_saida: "20:00:00",
          ativo: true,
        },
        {
          id: "horario-selecionado-11",
          empresa_id: "empresa-atual",
          horario_entrada: "11:00:00",
          horario_saida: "20:00:00",
          ativo: true,
        },
      ],
      shifts: [
        {
          id: "turno-anterior",
          empresa_id: "empresa-anterior",
          empresa_horario_id: "horario-anterior-11",
          ativo: true,
        },
        {
          id: "turno-selecionado",
          empresa_id: "empresa-atual",
          empresa_horario_id: "horario-selecionado-11",
          ativo: true,
        },
      ],
    }),
    {
      companyId: "empresa-atual",
      scheduleId: "horario-selecionado-11",
      shiftId: "turno-selecionado",
      scheduleLabel: "11:00 as 20:00",
    },
  );
});

test("aceita turnos duplicados quando pertencem a mesma jornada selecionada", () => {
  assert.deepEqual(
    resolveImportedOperation({
      companyName: "Sete Lagos",
      entryTime: "12:00",
      companies: [{ id: "empresa", nome: "Sete Lagos", ativa: true }],
      schedules: [
        {
          id: "horario-12",
          empresa_id: "empresa",
          horario_entrada: "12:00:00",
          horario_saida: "21:00:00",
          ativo: true,
        },
      ],
      shifts: [
        {
          id: "turno-b",
          empresa_id: "empresa",
          empresa_horario_id: "horario-12",
          ativo: true,
        },
        {
          id: "turno-a",
          empresa_id: "empresa",
          empresa_horario_id: "horario-12",
          ativo: true,
        },
      ],
    }),
    {
      companyId: "empresa",
      scheduleId: "horario-12",
      shiftId: "turno-a",
      scheduleLabel: "12:00 as 21:00",
    },
  );
});

test("mantem bloqueio quando existem jornadas diferentes e nenhuma foi selecionada", () => {
  assert.throws(
    () =>
      resolveImportedOperation({
        companyName: "Empresa Duplicada",
        entryTime: "11:00",
        companies: [
          { id: "empresa-a", nome: "Empresa Duplicada", ativa: true },
          { id: "empresa-b", nome: "Empresa Duplicada", ativa: true },
        ],
        schedules: [
          {
            id: "horario-a",
            empresa_id: "empresa-a",
            horario_entrada: "11:00:00",
            horario_saida: "20:00:00",
            ativo: true,
          },
          {
            id: "horario-b",
            empresa_id: "empresa-b",
            horario_entrada: "11:00:00",
            horario_saida: "21:00:00",
            ativo: true,
          },
        ],
        shifts: [
          { id: "turno-a", empresa_id: "empresa-a", empresa_horario_id: "horario-a", ativo: true },
          { id: "turno-b", empresa_id: "empresa-b", empresa_horario_id: "horario-b", ativo: true },
        ],
      }),
    /mais de um turno ativo/,
  );
});

test("permite revisar jornada nova antes da criacao automatica do turno", () => {
  assert.deepEqual(
    resolveImportedOperation({
      companyName: "Upside",
      entryTime: "07:00",
      allowMissingShift: true,
      preferredScheduleId: "upside-07",
      companies: [{ id: "upside", nome: "Upside", ativa: true }],
      schedules: [
        {
          id: "upside-07",
          empresa_id: "upside",
          horario_entrada: "07:00:00",
          horario_saida: "16:00:00",
          ativo: true,
        },
      ],
      shifts: [],
    }),
    {
      companyId: "upside",
      scheduleId: "upside-07",
      shiftId: "",
      scheduleLabel: "07:00 as 16:00",
    },
  );
});

test("rejeita empresa, jornada ou turno inexistente", () => {
  assert.throws(
    () =>
      resolveImportedOperation({
        companyName: "Outra",
        entryTime: "12:00",
        companies,
        schedules,
        shifts,
      }),
    /não foi encontrada/,
  );
  assert.throws(
    () =>
      resolveImportedOperation({
        companyName: "Sete Lagos",
        entryTime: "14:00",
        companies,
        schedules,
        shifts,
      }),
    /Não existe uma entrada/,
  );
  assert.throws(
    () =>
      resolveImportedOperation({
        companyName: "Sete Lagos",
        entryTime: "12:00",
        companies,
        schedules,
        shifts: [],
      }),
    /turno ativo/,
  );
});

test("classifica equipe, banco, novo e homonimo por nome exato", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo F", "Pessoa Exemplo E", "Pessoa Exemplo J", "Pessoa Exemplo D"],
    companyId: "company-1",
    scheduleId: "schedule-1",
    collaborators: [
      { id: "ana", nome: "PESSOA EXEMPLO F", telefone: "5510900000001", ativo: true },
      { id: "bruno", nome: "Pessoa Exemplo E", telefone: "5510900000002", ativo: true },
      { id: "daniel-1", nome: "Pessoa Exemplo D", telefone: "5510900000003", ativo: true },
      { id: "daniel-2", nome: "Pessoa Exemplo D", telefone: "5510900000004", ativo: true },
    ],
    links: [
      {
        colaborador_id: "ana",
        empresa_id: "company-1",
        empresa_horario_id: "schedule-1",
        ativo: true,
      },
    ],
  });

  assert.equal(result[0].status, "team");
  assert.equal(result[0].collaboratorId, "ana");
  assert.equal(result[1].status, "bank");
  assert.equal(result[1].collaboratorId, "bruno");
  assert.equal(result[2].status, "new");
  assert.equal(result[3].status, "ambiguous");
  assert.equal(result[3].candidates.length, 2);
});

test("nao associa nomes parecidos nem resolve homonimo automaticamente", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo F", "Pessoa Exemplo D"],
    companyId: "company-1",
    scheduleId: "schedule-1",
    collaborators: [
      { id: "ana", nome: "Pessoa Exemplos F", telefone: "5510900000001", ativo: true },
      { id: "daniel-1", nome: "Pessoa Exemplo D", telefone: "5510900000002", ativo: true },
      { id: "daniel-2", nome: "Pessoa Exemplo D", telefone: "5510900000003", ativo: true },
    ],
    links: [
      {
        colaborador_id: "daniel-1",
        empresa_id: "company-1",
        empresa_horario_id: "schedule-1",
        ativo: true,
      },
    ],
  });

  assert.equal(result[0].status, "new");
  assert.equal(result[1].status, "ambiguous");
});

test("reconhece nomes proximos unicos dentro da equipe selecionada", () => {
  const result = classifyImportedCollaborators({
    names: [
      "Pessoa Exemplo Costa",
      "Pessoa Exemplo Lima",
      "Pessoa Exemplo Ferreira da Silva",
    ],
    companyId: "smart-logistica",
    scheduleId: "smart-09",
    collaborators: [
      {
        id: "theonilio",
        nome: "Pessoa Exemplo Costa Marques",
        telefone: "5510900000018",
        ativo: true,
      },
      {
        id: "walisson",
        nome: "Walisson Jesus de Lima",
        telefone: "5510900000019",
        ativo: true,
      },
      {
        id: "vitor",
        nome: "Pessoa Exemplo Ferreira",
        telefone: "5510900000020",
        ativo: true,
      },
    ],
    links: [
      {
        colaborador_id: "theonilio",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
      {
        colaborador_id: "walisson",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
      {
        colaborador_id: "vitor",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
    ],
  });

  assert.deepEqual(
    result.map((row) => ({
      importedName: row.importedName,
      status: row.status,
      collaboratorId: row.collaboratorId,
      registeredName: row.candidates[0]?.name,
    })),
    [
      {
        importedName: "Pessoa Exemplo Costa",
        status: "similar_team",
        collaboratorId: "theonilio",
        registeredName: "Pessoa Exemplo Costa Marques",
      },
      {
        importedName: "Pessoa Exemplo Lima",
        status: "similar_team",
        collaboratorId: "walisson",
        registeredName: "Walisson Jesus de Lima",
      },
      {
        importedName: "Pessoa Exemplo Ferreira da Silva",
        status: "similar_team",
        collaboratorId: "vitor",
        registeredName: "Pessoa Exemplo Ferreira",
      },
    ],
  );
});

test("reconhece nome abreviado e pequena variacao de grafia na mesma equipe", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo Ezequiel", "Kayky de Araújo Mendes"],
    companyId: "smart-logistica",
    scheduleId: "smart-09",
    collaborators: [
      {
        id: "bruno",
        nome: "Pessoa Exemplo Ezequiel de Souza",
        telefone: "5510900000018",
        ativo: true,
      },
      {
        id: "kayky",
        nome: "Kaiky de Araújo Mendes",
        telefone: "5510900000019",
        ativo: true,
      },
    ],
    links: [
      {
        colaborador_id: "bruno",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
      {
        colaborador_id: "kayky",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
    ],
  });

  assert.deepEqual(
    result.map((row) => ({
      importedName: row.importedName,
      status: row.status,
      collaboratorId: row.collaboratorId,
      registeredName: row.candidates[0]?.name,
    })),
    [
      {
        importedName: "Pessoa Exemplo Ezequiel",
        status: "similar_team",
        collaboratorId: "bruno",
        registeredName: "Pessoa Exemplo Ezequiel de Souza",
      },
      {
        importedName: "Kayky de Araújo Mendes",
        status: "similar_team",
        collaboratorId: "kayky",
        registeredName: "Kaiky de Araújo Mendes",
      },
    ],
  );
});

test("usa o cadastro correto para pequenas variacoes do exemplo de Sete Lagos", () => {
  const parsed = parseShiftListImport(`Empresa: Sete Lagos ; Entrada: 12:00 ; Data: 31/07/2026 ; Disparo: 09:00

- Pessoa Exemplo Santos Reiss
✅ Pessoa Exemplo Silva Santoss`);
  const result = classifyImportedCollaborators({
    names: parsed.names,
    companyId: "sete-lagos",
    scheduleId: "sete-lagos-12",
    collaborators: [
      { id: "isaac", nome: "Pessoa Exemplo Santos Reis", telefone: "5510900000018", ativo: true },
      { id: "william", nome: "Pessoa Exemplo Silva Santos", telefone: "5510900000019", ativo: true },
    ],
    links: [
      {
        colaborador_id: "isaac",
        empresa_id: "sete-lagos",
        empresa_horario_id: "sete-lagos-12",
        ativo: true,
      },
      {
        colaborador_id: "william",
        empresa_id: "sete-lagos",
        empresa_horario_id: "sete-lagos-12",
        ativo: true,
      },
    ],
  });

  assert.deepEqual(
    result.map((row) => ({
      status: row.status,
      collaboratorId: row.collaboratorId,
      registeredName: row.candidates[0]?.name,
    })),
    [
      {
        status: "similar_team",
        collaboratorId: "isaac",
        registeredName: "Pessoa Exemplo Santos Reis",
      },
      {
        status: "similar_team",
        collaboratorId: "william",
        registeredName: "Pessoa Exemplo Silva Santos",
      },
    ],
  );
});

test("nao usa correspondencia aproximada fora da equipe nem por nome de uma parte", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo Costa", "Vitor"],
    companyId: "smart-logistica",
    scheduleId: "smart-09",
    collaborators: [
      {
        id: "theonilio-outra-equipe",
        nome: "Pessoa Exemplo Costa Marques",
        telefone: "5510900000018",
        ativo: true,
      },
      {
        id: "vitor-da-equipe",
        nome: "Pessoa Exemplo Ferreira",
        telefone: "5510900000019",
        ativo: true,
      },
    ],
    links: [
      {
        colaborador_id: "theonilio-outra-equipe",
        empresa_id: "outra-empresa",
        empresa_horario_id: "outro-horario",
        ativo: true,
      },
      {
        colaborador_id: "vitor-da-equipe",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
    ],
  });

  assert.equal(result[0].status, "new");
  assert.equal(result[1].status, "new");
});

test("mantem selecao manual quando um nome abreviado encontra duas pessoas", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo Ezequiel"],
    companyId: "smart-logistica",
    scheduleId: "smart-09",
    collaborators: [
      {
        id: "bruno-souza",
        nome: "Pessoa Exemplo Ezequiel de Souza",
        telefone: "5510900000018",
        ativo: true,
      },
      {
        id: "bruno-santos",
        nome: "Pessoa Exemplo Ezequiel dos Santos",
        telefone: "5510900000019",
        ativo: true,
      },
    ],
    links: [
      {
        colaborador_id: "bruno-souza",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
      {
        colaborador_id: "bruno-santos",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
    ],
  });

  assert.equal(result[0].status, "ambiguous");
  assert.deepEqual(
    result[0].candidates.map((candidate) => candidate.id),
    ["bruno-souza", "bruno-santos"],
  );
});

test("mantem selecao manual quando dois integrantes da equipe sao correspondencias provaveis", () => {
  const result = classifyImportedCollaborators({
    names: ["Pessoa Exemplo G Silva"],
    companyId: "smart-logistica",
    scheduleId: "smart-09",
    collaborators: [
      {
        id: "joao-santos",
        nome: "Pessoa Exemplo G Silva Santos",
        telefone: "5510900000018",
        ativo: true,
      },
      {
        id: "joao-souza",
        nome: "Pessoa Exemplo G Silva Souza",
        telefone: "5510900000019",
        ativo: true,
      },
    ],
    links: [
      {
        colaborador_id: "joao-santos",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
      {
        colaborador_id: "joao-souza",
        empresa_id: "smart-logistica",
        empresa_horario_id: "smart-09",
        ativo: true,
      },
    ],
  });

  assert.equal(result[0].status, "ambiguous");
  assert.deepEqual(
    result[0].candidates.map((candidate) => candidate.id),
    ["joao-santos", "joao-souza"],
  );
});
