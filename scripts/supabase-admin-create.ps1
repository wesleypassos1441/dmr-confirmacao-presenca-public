param(
  [string]$Email,
  [string]$Nome = "Administrador DMR"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path "supabase/.temp/project-ref")) {
  throw "Projeto Supabase ainda nao esta linkado. Rode scripts/supabase-link.ps1 primeiro."
}

if (-not $Email) {
  $Email = Read-Host "Digite o e-mail do usuario criado no Supabase Auth"
}

if (-not $Email -or $Email -notmatch "@") {
  throw "E-mail invalido."
}

$safeEmail = $Email.Replace("'", "''")
$safeNome = $Nome.Replace("'", "''")
$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("dmr-admin-" + [Guid]::NewGuid().ToString("N") + ".sql")

$sql = @"
do `$`$
begin
  if not exists (select 1 from auth.users where lower(email) = lower('$safeEmail')) then
    raise exception 'Usuario $safeEmail nao encontrado no Supabase Auth. Crie o usuario em Authentication > Users e rode novamente.';
  end if;
end;
`$`$;

insert into public.usuarios_dashboard(auth_user_id, email, nome, papel, ativo)
select id, email, '$safeNome', 'admin', true
from auth.users
where lower(email) = lower('$safeEmail')
on conflict (email) do update
set papel = 'admin',
    nome = excluded.nome,
    ativo = true,
    atualizado_em = now();

select email, nome, papel, ativo
from public.usuarios_dashboard
where lower(email) = lower('$safeEmail');
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tempFile, $sql, $utf8NoBom)

try {
  & npx supabase db query --linked --file $tempFile
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar admin no Supabase. Exit code: $LASTEXITCODE."
  }
} finally {
  Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Se a consulta retornou uma linha com papel admin e ativo true, o usuario ja pode acessar o Dashboard."
