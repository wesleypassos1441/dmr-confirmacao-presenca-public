import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

const supabaseUrl = requiredEnv("DMR_ADMIN_SUPABASE_URL");
const serviceRoleKey = requiredEnv("DMR_ADMIN_SERVICE_ROLE_KEY");
const email = requiredEnv("DMR_ADMIN_USER_EMAIL").toLowerCase();
const password = requiredEnv("DMR_ADMIN_NEW_PASSWORD");

if (password.length < 8) {
  throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let targetUser = null;

for (let page = 1; page <= 100 && !targetUser; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;

  const users = data?.users ?? [];
  targetUser = users.find((user) => user.email?.toLowerCase() === email) ?? null;

  if (users.length < 1000) break;
}

if (!targetUser) {
  throw new Error(`Usuario ${email} nao encontrado no Supabase Auth.`);
}

const { error } = await supabase.auth.admin.updateUserById(targetUser.id, { password });
if (error) throw error;

console.log(`Senha atualizada para ${email}.`);
