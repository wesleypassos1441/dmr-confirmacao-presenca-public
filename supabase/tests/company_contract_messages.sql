begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select has_column('public', 'empresas', 'tipo_contratacao', 'empresas possui tipo de contratacao');

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'empresas_tipo_contratacao_check'
      and conrelid = 'public.empresas'::regclass
  ),
  'tipo de contratacao possui validacao no banco'
);

select is(
  public.dmr_mensagem_com_tipo_contrato('Bom dia.', 'freelancer'),
  E'*Freelancer: SEM VÍNCULO EMPREGATÍCIO*\n\nBom dia.',
  'freelancer recebe cabecalho correto'
);

select is(
  public.dmr_mensagem_com_tipo_contrato('Bom dia.', 'intermitente'),
  E'*Contrato Intermitente: Conforme diárias trabalhadas*\n\nBom dia.',
  'contrato intermitente recebe cabecalho correto'
);

select is(
  public.dmr_mensagem_com_tipo_contrato('Bom dia.', null),
  'Bom dia.',
  'cadastro antigo sem classificacao preserva a mensagem'
);

select is(
  public.dmr_mensagem_com_tipo_contrato(
    E'*Freelancer: SEM VÍNCULO EMPREGATÍCIO*\n\nBom dia.',
    'intermitente'
  ),
  E'*Contrato Intermitente: Conforme diárias trabalhadas*\n\nBom dia.',
  'troca de tipo substitui o cabecalho sem duplicar'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'trg_dmr_aplicar_tipo_contrato_fila'
      and tgrelid = 'public.fila_mensagens'::regclass
      and not tgisinternal
  ),
  'fila aplica tipo de contratacao automaticamente'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.dmr_mensagem_com_tipo_contrato(text,text)',
    'EXECUTE'
  ),
  'funcao auxiliar de mensagem nao fica exposta ao frontend'
);

select * from finish();
rollback;
