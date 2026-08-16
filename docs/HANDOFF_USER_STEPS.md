# Passos Para o Usuario

1. Abra o Docker Desktop.
2. Espere ele carregar.
3. Abra o terminal na pasta `dmr-confirmacao-presenca`.
4. Rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-check.ps1
```

5. Se aparecer que o login esta pendente, rode:

```powershell
npx supabase login
```

6. O Supabase vai pedir um token. Copie o token no site e cole no terminal.
7. Depois rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-link.ps1
```

8. Quando pedir o Project Ref, abra o Supabase, entre no projeto, va em Project Settings e copie o Project Ref.
9. Se pedir senha do banco, digite a senha que voce criou no Supabase. Ela nao aparece enquanto digita. Isso e normal.
10. Configure os secrets:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-secrets-set.ps1
```

11. Faça o deploy:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-deploy.ps1
```

12. Crie seu usuario no Supabase Auth.
13. Dê permissao de admin para esse usuario:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-admin-create.ps1 -Email "seu-email@exemplo.com"
```

14. Crie `.env.local` usando `.env.example` como modelo.
15. Rode o Dashboard:

```powershell
npm run dev
```

16. Rode o bot:

```powershell
npm run dev:bot
```

17. Quando o QR Code aparecer no terminal, abra o WhatsApp no celular, toque em aparelhos conectados e escaneie.

Se o Docker mostrar erro `read-only file system`, reinicie o Docker Desktop e rode o comando novamente.
