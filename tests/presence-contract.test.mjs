import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  absenceReply,
  confirmationReply,
  contractHeading,
  normalizarResposta,
} from "../supabase/functions/_shared/presence.ts";

test("normalizacao reconhece as novas respostas afirmativas", () => {
  for (const value of ["SS", "ss", "1 sim", "1 - sim", "S", "SIM"]) {
    assert.deepEqual(normalizarResposta(value), { tipo: "confirmado", resposta_normalizada: "sim" });
  }
});

test("normalizacao reconhece as novas respostas negativas", () => {
  for (const value of ["2 não", "2 nao", "2 - não", "N", "NAO", "NÃO"]) {
    assert.deepEqual(normalizarResposta(value), { tipo: "nao_comparecera", resposta_normalizada: "nao" });
  }
});

test("mensagens condicionais respeitam freelancer e contrato intermitente", () => {
  assert.equal(contractHeading("freelancer"), "*Freelancer: SEM VÍNCULO EMPREGATÍCIO*");
  assert.equal(contractHeading("intermitente"), "*Contrato Intermitente: Conforme diárias trabalhadas*");
  assert.equal(confirmationReply("Pessoa Exemplo L"), "Obrigado pela sua confirmação *Pessoa Exemplo L*. Contamos com a sua presença.");
  assert.equal(
    absenceReply("Pessoa Exemplo L", "freelancer"),
    "Obrigado pela sua resposta *Pessoa Exemplo L*. Gostaria de indicar alguém para ir em seu lugar?",
  );
  assert.equal(absenceReply("Pessoa Exemplo L", "intermitente"), "Obrigado pela sua resposta *Pessoa Exemplo L*.");
});

test("Edge Function usa o contrato da empresa nas respostas automaticas", () => {
  const source = readFileSync(new URL("../supabase/functions/bot-register-incoming/index.ts", import.meta.url), "utf8");

  assert.match(source, /empresas!inner\(id, nome, tipo_contratacao\)/);
  assert.match(source, /confirmationReply\(item\.colaboradores\.nome\)/);
  assert.match(source, /absenceReply\(item\.colaboradores\.nome, item\.escalas\.empresas\.tipo_contratacao\)/);
});

test("comunicado pontual nao altera confirmacao nem serve como pergunta operacional", () => {
  const markSent = readFileSync(new URL("../supabase/functions/bot-mark-sent/index.ts", import.meta.url), "utf8");
  const incoming = readFileSync(new URL("../supabase/functions/bot-register-incoming/index.ts", import.meta.url), "utf8");

  assert.match(markSent, /queue\.tipo === "comunicado_manual"/);
  assert.match(incoming, /\.not\("mensagem_enviada_em", "is", null\)/);
  assert.doesNotMatch(incoming, /comunicado_manual.*mensagem_enviada_em/s);
});
