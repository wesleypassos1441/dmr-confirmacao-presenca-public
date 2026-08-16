import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

export function serviceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuracao Supabase indisponivel.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export function assertSupabaseResult<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}
