alter table public.mensagens_recebidas
  add column if not exists processada_em timestamptz;

comment on column public.mensagens_recebidas.processada_em is
  'Preenchido somente depois que a resposta foi aplicada ao estado operacional.';
