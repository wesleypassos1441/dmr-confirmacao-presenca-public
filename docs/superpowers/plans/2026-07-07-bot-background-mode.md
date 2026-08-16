# Bot Background Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar o bot DMR oculto em segundo plano, com comandos simples para ligar, consultar o estado online e desligar.

**Architecture:** Um supervisor PowerShell oculto sera o unico proprietario do processo operacional do bot. Arquivos locais de PID, estado e log permitirao controle seguro; o comando de status combinara processo local e heartbeat remoto para evitar falso positivo.

**Tech Stack:** Windows PowerShell 5.1, CMD, Node.js, Supabase REST, testes estaticos Node Test Runner.

---

### Task 1: Contrato dos inicializadores

**Files:**
- Modify: `tests/static-security.test.mjs`
- Create: `scripts/bot-background-common.ps1`
- Create: `scripts/start-bot-background.ps1`
- Create: `scripts/bot-supervisor.ps1`
- Modify: `Ligar Bot DMR.cmd`

- [ ] **Step 1: Escrever testes estaticos que exijam inicializacao oculta e identificacao exclusiva**

Adicionar assercoes para `WindowStyle Hidden`, `bot-supervisor.ps1`, arquivo de estado `.dmr-bot-supervisor.json` e rejeicao de supervisor ainda ativo.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `node --import tsx --test tests/static-security.test.mjs`

Expected: FAIL porque os scripts de segundo plano ainda nao existem.

- [ ] **Step 3: Implementar o modulo comum e o supervisor minimo**

O modulo comum deve resolver caminhos somente dentro do projeto, ler/escrever JSON UTF-8 sem BOM, validar PID e conferir que o comando do processo pertence a `bot-supervisor.ps1` deste projeto. O supervisor deve gravar seu PID, executar `scripts/start-bot.ps1`, repetir somente quando receber codigo `75` e remover o arquivo de estado ao sair.

- [ ] **Step 4: Implementar inicializacao oculta**

`start-bot-background.ps1` deve rejeitar instancia ativa, remover estado obsoleto, rotacionar o log quando ultrapassar 5 MB e chamar:

```powershell
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', $supervisorPath
)
```

`Ligar Bot DMR.cmd` deve chamar esse script e encerrar sem manter terminal aberto.

- [ ] **Step 5: Executar o teste e confirmar GREEN**

Run: `node --import tsx --test tests/static-security.test.mjs`

Expected: PASS.

### Task 2: Estado ONLINE no CMD

**Files:**
- Modify: `tests/static-security.test.mjs`
- Create: `scripts/status-bot.ps1`
- Create: `Status Bot DMR.cmd`

- [ ] **Step 1: Escrever teste que exija os quatro estados operacionais**

Exigir os textos `ONLINE`, `INICIANDO`, `OFFLINE` e `COM FALHA`, consulta a `bot_heartbeats` e limite de frescor do heartbeat.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `node --import tsx --test tests/static-security.test.mjs`

Expected: FAIL porque o comando de status ainda nao existe.

- [ ] **Step 3: Implementar status local e remoto**

O script deve carregar `.env` sem imprimir valores, validar o supervisor e consultar o ultimo heartbeat com a chave local de servico. A classificacao sera:

- `ONLINE`: supervisor ativo e heartbeat `online` com no maximo 2 minutos.
- `INICIANDO`: supervisor ativo, mas ainda sem heartbeat recente.
- `COM FALHA`: supervisor ativo e ultimo heartbeat de erro, ou log com encerramento inesperado.
- `OFFLINE`: nenhum supervisor ativo.

O CMD deve manter a janela aberta apenas para o usuario ler o resultado.

- [ ] **Step 4: Executar o teste e confirmar GREEN**

Run: `node --import tsx --test tests/static-security.test.mjs`

Expected: PASS.

### Task 3: Desligamento controlado

**Files:**
- Modify: `tests/static-security.test.mjs`
- Create: `scripts/stop-bot-background.ps1`
- Create: `Desligar Bot DMR.cmd`

- [ ] **Step 1: Escrever teste que proiba encerramento generico de Node/Chrome**

Exigir validacao do PID pelo modulo comum e impedir comandos amplos como `taskkill /IM node.exe` ou `Stop-Process -Name node`.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `node --import tsx --test tests/static-security.test.mjs`

Expected: FAIL porque o desligamento ainda nao existe.

- [ ] **Step 3: Implementar encerramento da arvore pertencente ao supervisor**

Enumerar descendentes pelo `ParentProcessId`, validar o supervisor registrado e encerrar filhos antes do supervisor. Remover o arquivo de estado apenas depois da verificacao.

- [ ] **Step 4: Executar o teste e confirmar GREEN**

Run: `node --import tsx --test tests/static-security.test.mjs`

Expected: PASS.

### Task 4: Documentacao, verificacao e teste operacional

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Ignorar estado e logs locais**

Adicionar `.dmr-bot-supervisor.json` e `logs/bot-background*.log` ao `.gitignore`.

- [ ] **Step 2: Documentar os tres comandos**

Explicar no README que `Ligar` fica oculto, `Status` mostra o estado e `Desligar` encerra de forma segura.

- [ ] **Step 3: Executar verificacao completa**

Run:

```powershell
npm test
npm run typecheck
npm run secrets:scan
npm run build -w apps/whatsapp-bot
git diff --check
```

Expected: todos os comandos com exit code `0`.

- [ ] **Step 4: Testar ciclo operacional**

Desligar a instancia visivel atual, iniciar com `Ligar Bot DMR.cmd`, confirmar ausencia de janela persistente, executar `Status Bot DMR.cmd` ate obter `ONLINE`, confirmar heartbeat novo no Supabase e finalizar com `Desligar Bot DMR.cmd`.

- [ ] **Step 5: Commit e push**

```powershell
git add .
git commit -m "Run WhatsApp bot in background"
git push
```

