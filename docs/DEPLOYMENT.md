# Setup & Deployment

How to stand up FabOps Governance on Azure — the three things this repository deploys, the Azure resources they depend on, and the four Foundry agents. Commands use placeholders (`<like-this>`) with **suggested defaults** called out; infrastructure is provided as Bicep under [`infra/`](../infra).

## What gets deployed

| Component | In this repo | Target | How |
|---|---|---|---|
| **FabOps.Web** | `src/FabOps.Web` | Azure **Static Web Apps** | `npm run build` → SWA CLI / [`deploy-web.yml`](../.github/workflows/deploy-web.yml) |
| **FabOps.Api** (UI bridge) | `src/FabOps.Api` | Azure **Functions** (Flex Consumption, .NET 8) | `func publish` / [`deploy-api.yml`](../.github/workflows/deploy-api.yml) |
| **FabOps.CosmosMcp** (governance store MCP) | `src/FabOps.CosmosMcp` | Azure **Functions** (Flex Consumption, .NET 8) | `func publish` / [`deploy-cosmosmcp.yml`](../.github/workflows/deploy-cosmosmcp.yml) |
| **The four agents** | `deploy/agents` (setup scripts) | Azure **AI Foundry Agent Service** | [`deploy/agents`](../deploy/agents) export/deploy scripts |

**Depended on, provisioned by the Bicep:** Azure Cosmos DB (serverless + vector search) and its 3 containers, Storage, Application Insights.

**Depended on, NOT provisioned here (separate / pre-existing):** the Azure AI Foundry account + project + **GPT‑4.1** deployment (the agents' home — often a different subscription), the Azure OpenAI **embedding** deployment the Cosmos MCP uses, the Fabric MCP server, and the **Entra app registration** for sign‑in.

## Prerequisites

- **Tools:** Azure CLI (`az`) with Bicep (`az bicep install`); .NET 8 SDK; Node 20+; [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local); [SWA CLI](https://azure.github.io/static-web-apps-cli/) (`npm i -g @azure/static-web-apps-cli`). Or Visual Studio 2022 17.8+/2026.
- **Azure:** a subscription, and rights to create resources + assign roles (Owner or Contributor + User Access Administrator on the target resource group).
- **Entra app registration** for the SPA sign‑in, with SPA redirect URIs `http://localhost:5173` and your SWA URL. Note its **tenant id** and **client id**.
- **A Foundry project** with a **GPT‑4.1** model deployment, and an **Azure OpenAI embedding** deployment (`text-embedding-3-large`, 1536 dims — must match the Cosmos vector index).

---

## Step 1 — Provision the Azure infrastructure (Bicep)

[`infra/main.bicep`](../infra/main.bicep) creates Cosmos (account + `governance-rules` / `governance-executions` / `governance-execution-items`, with the diskANN/1536‑d/cosine vector index), Storage, App Insights, both Function Apps (Flex Consumption, keyless), and the Static Web App, plus the managed‑identity role assignments. Defaults are in [`infra/main.bicepparam`](../infra/main.bicepparam).

```bash
RG=<rg-fabops>                 # suggested: rg-fabops
az group create -n $RG -l <region>          # suggested: uksouth (matches the Cosmos account)

# Always preview first:
az deployment group what-if -g $RG -f infra/main.bicep -p infra/main.bicepparam

az deployment group create  -g $RG -f infra/main.bicep -p infra/main.bicepparam \
  -p openAiResourceId=<aoai-resource-id> openAiEndpoint=<aoai-endpoint> \
     entraTenantId=<tenant-id> entraClientId=<spa-client-id>
```

The deployment outputs the Function App names/hostnames, the SWA hostname, and the UI Function App's managed‑identity principal id (needed in Step 2). It does **not** set `Agent__Url` yet — that comes after the agents exist.

> If your Azure OpenAI account is in another subscription/resource group, pass its full `openAiResourceId`; the Bicep grants the MCP identity **Cognitive Services OpenAI User** there via a module. Leave it empty to grant that role by hand later.

---

## Step 2 — Set up the Foundry agents

The four agents (Orchestrator, Rules Generator & Manager, FRL Compiler & Runner, Policy Checker) are **data‑plane objects** in the Foundry project, not ARM resources, so they're handled by scripts in [`deploy/agents`](../deploy/agents) rather than Bicep.

**2a. Grant access (one‑time).** The identity running the scripts needs a role on the Foundry resource:

```bash
# read (to export/capture the live agents) — and write (to create them):
az role assignment create --assignee <your-id> --role "Azure AI User" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<foundry-resource>"
az role assignment create --assignee <your-id> --role "Azure AI Project Manager" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<foundry-resource>"
```

**2b. Capture and (re)create.** See [`deploy/agents/README.md`](../deploy/agents/README.md):

```powershell
az login
# Capture the current agents to deploy/agents/definitions/*.json:
./deploy/agents/export-agents.ps1 -ProjectEndpoint https://<foundry-resource>.services.ai.azure.com/api/projects/<project>
# (Re)create them in a target project, optionally overriding the model:
./deploy/agents/deploy-agents.ps1  -ProjectEndpoint https://<foundry-resource>.services.ai.azure.com/api/projects/<project> -ModelDeployment gpt-4.1
```

Each agent's `tools` array carries the **AG‑UI render functions** (`render_table`/`donut`/`chart`/`card`/`badge`/`rule_source`), the **MCP tools** (the Cosmos MCP from Step 4, the Fabric MCP), and the **A2A** `connected_agent` links.

**2c. Wire the UI to the orchestrator.** Set `FabOps.Api`'s `Agent__Url` to:
`https://<foundry-resource>.services.ai.azure.com/api/projects/<project>/agents/<orchestrator-id>/endpoint/protocols/openai/responses?api-version=2025-11-15-preview`

**2d. Let the UI call the agent.** Grant the **UI Function App's managed identity** (principal id from Step 1) the **Azure AI User** role on the Foundry resource — the bridge calls the agent with that identity (`Agent__TokenScope = https://ai.azure.com/.default`, no stored secret).

---

## Step 3 — Configure

App settings are set by the Bicep; to change them later use `az functionapp config appsettings set`. For **local** development, copy the templates (both git‑ignored once copied):

- `src/FabOps.Api/local.settings.example.json` → `local.settings.json` (set `Agent__Url`, `Entra__TenantId`, `Entra__ClientId`; keep `Entra__RequireAuthentication=false` locally).
- `src/FabOps.CosmosMcp/local.settings.example.json` → `local.settings.json` (Cosmos + Azure OpenAI endpoints; your `az login` identity needs the Cosmos data role).

### Configuration reference

| Setting (app-setting form) | Component | Purpose |
|---|---|---|
| `Agent__Url` | API | the orchestrator agent's **OpenAI‑Responses** endpoint; unset → UI shows "agent not configured" |
| `Agent__TokenScope` | API | Entra scope the managed identity requests (default `https://ai.azure.com/.default`) |
| `Entra__TenantId`, `Entra__ClientId` | API | served to the SPA for MSAL sign‑in |
| `Entra__RequireAuthentication` | API | `true` in Azure — `/api/agent` then requires a valid Entra bearer token (validated in‑code by `EntraTokenValidator`) |
| `VITE_API_BASE_URL` | Web (build) | the API Function App origin; empty locally (Vite proxies `/api`) |
| `COSMOS_ENDPOINT`, `COSMOS_DATABASE` | CosmosMcp | the governance store |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DIMENSIONS` | CosmosMcp | embeddings for `vector_search` (1536 must match the container's vector policy) |

---

## Step 4 — Deploy the code

**FabOps.CosmosMcp** (deploy first — the agents and the embedding role depend on it):
```bash
func azure functionapp publish <cosmosmcp-func-name>
# then add it to the Foundry project: Tools → Add Custom Tool → MCP, with its SSE URL
# (see src/FabOps.CosmosMcp/README.md for the URL + key).
```

**FabOps.Api**:
```bash
cd src/FabOps.Api && func azure functionapp publish <ui-func-name>
```

**FabOps.Web**:
```bash
cd src/FabOps.Web
VITE_API_BASE_URL=https://<ui-func-name>.azurewebsites.net npm run build
swa deploy ./dist --deployment-token <swa-token> --env production
```

CI/CD equivalents (manual `workflow_dispatch`): set the secrets/variables documented at the top of each workflow, then run them from the Actions tab. The SPA calls the Function App origin **directly** (not the SWA `/api` proxy, whose 45‑second limit would cut off agent runs — [DECISIONS.md](DECISIONS.md) D03).

---

## Step 5 — Verify

```bash
curl https://<ui-func-name>.azurewebsites.net/api/config     # {"agent_url":"https://…"} once Agent__Url is set
curl https://<ui-func-name>.azurewebsites.net/api/agent -X POST   # 401 when RequireAuthentication=true (expected without a token)
```

Browse the SWA URL, sign in, and run a rule. `dotnet test` runs the API unit tests with no cloud resources.

---

## See also

- [`infra/`](../infra) — the Bicep and parameters.
- [`deploy/agents/README.md`](../deploy/agents/README.md) — the agent export/deploy scripts and required roles.
- [`src/FabOps.CosmosMcp/README.md`](../src/FabOps.CosmosMcp/README.md) — the MCP server's tools, settings, and role assignments.
- [`DECISIONS.md`](DECISIONS.md) — why Functions + streaming (D02), SWA‑direct (D03), the auth model (D08).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the whole‑solution design.
