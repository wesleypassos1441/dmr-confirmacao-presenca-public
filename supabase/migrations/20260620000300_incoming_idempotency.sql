alter table public.mensagens_recebidas
add column if not exists whatsapp_message_id text;

create unique index if not exists mensagens_recebidas_whatsapp_message_id_key
on public.mensagens_recebidas(whatsapp_message_id);
