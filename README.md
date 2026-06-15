# FabOps Governance — UI

The Azure conversion of the reference project's `FabOpsUI`: the public face of FabricGuard,
where you chat with the FabOps agent to author Microsoft Fabric governance rules in plain
English and run them against your tenant.

This repo contains **the UI and its thin API only** — the agents and their MCP proxies are
separate systems (owned by the agent team) that this app reaches through one configured URL,
exactly as the original UI reached its agent. What changed is the technology, not the
application:

| | Reference project | This solution |
|---|---|---|
| SPA hosting | Cloud Run (served by the backend) | **Azure Static Web Apps** |
| Chat surface | hand-built on raw `@ag-ui/client` | **CopilotKit v2** (AG-UI), with six render components-as-tools |
| Backend | FastAPI on Cloud Run | **Azure Functions** (.NET 8 isolated) |
| Agent bridge | AG-UI ⇄ Vertex `streamQuery` translation | transparent **AG-UI relay** over SSE (streaming preserved) |
| Endpoints | `GET /api/config`, `GET /api/secrets`, `POST /api/agent` | the same three, same response shapes |

Details and every deliberate divergence: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DECISIONS.md](docs/DECISIONS.md).

## Solution layout

```
FabOpsGovernance.sln
├── src/FabOps.Api      Azure Functions: /api/config, /api/secrets, /api/agent (SSE relay)
├── src/FabOps.Web      Vite + React + CopilotKit SPA (esproj)
└── tests/FabOps.Tests  xunit: endpoint contracts + relay behaviour
```

The agent renders rich UI by calling six display-only frontend tools — `render_table`,
`render_donut`, `render_chart`, `render_card`, `render_badge`, `render_code`. Their contract
is [docs/ui-render-primitives.md](docs/ui-render-primitives.md); how the agent should use them
is [docs/ui-rendering-skill.md](docs/ui-rendering-skill.md) (for the agent team's prompt).
CopilotKit forwards the declarations on every run and the relay passes them through untouched;
on the agent side, ADK's `AGUIToolset()` picks them up when the agent is served over an AG-UI
endpoint.

## Prerequisites

- Visual Studio 2022 17.8+ (or 2026) with the **Azure development** and
  **JavaScript and TypeScript** workloads — or the .NET 8+ SDK, Node.js 20+, and
  [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- A running agent exposed over an **AG-UI endpoint** (its URL goes into `Agent__Url`)
- A **Microsoft Entra app registration** for sign-in, with SPA redirect URIs
  `http://localhost:5173` and your SWA URL

## Run locally

1. Open `FabOpsGovernance.sln`.
2. Fill `src/FabOps.Api/local.settings.json` (git-ignored):
   - `Agent__Url` — the agent's AG-UI endpoint (leave empty to see the "agent not configured" state)
   - `Agent__AuthHeaderValue` — optional downstream secret/header value, if the agent needs one
   - `Entra__TenantId`, `Entra__ClientId` — for the Microsoft sign-in
3. Set **multiple startup projects** — `FabOps.Api` and `FabOps.Web` — and F5.
   CLI equivalent: `func start` in `src/FabOps.Api`, `npm run dev` in `src/FabOps.Web`.
4. Browse `http://localhost:5173`. The Vite dev server proxies `/api` to the Functions host.

`dotnet test` runs the unit tests (no cloud resources required).

## Deploy to Azure

**API → Azure Functions** (Flex Consumption recommended — HTTP streaming, long runs)

1. Create the Function App (.NET 8 isolated) and add the application settings from
   [Configuration](#configuration).
2. Deploy from Visual Studio (right-click `FabOps.Api` → Publish) or push to `main` with
   [deploy-api.yml](.github/workflows/deploy-api.yml) configured.
3. Allow CORS from your SWA origin:
   `az functionapp cors add -g <rg> -n <app> --allowed-origins https://<your-swa>.azurestaticapps.net`
4. Recommended: enable **App Service Authentication** (Entra, "allow unauthenticated
   requests") and set `Entra__RequireAuthentication=true` so `/api/agent` only serves
   signed-in users.

**Web → Azure Static Web Apps**

1. Create a Static Web App ("Other" deployment source) and copy its deployment token.
2. Add repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN` and repo variable `VITE_API_BASE_URL`
   (the Function App origin). [deploy-web.yml](.github/workflows/deploy-web.yml) builds and
   uploads on push to `main`.

The SPA calls the Function App directly — deliberately not through the SWA `/api` proxy, whose
hard 45-second request limit would cut off agent runs ([DECISIONS.md](docs/DECISIONS.md) D03).

## Configuration

| Setting (app setting form) | Required | Purpose |
|---|---|---|
| `Agent__Url` | yes | the agent's AG-UI endpoint (the reference project's `FABOPS`) |
| `Agent__AuthHeaderName` / `Agent__AuthHeaderValue` | no | optional header for the downstream agent (name defaults to `Authorization`) |
| `Entra__TenantId`, `Entra__ClientId` | yes | served to the SPA for MSAL sign-in |
| `Entra__ClientSecret` | no | only reported as `client_secret_set` on the config page |
| `Entra__RequireAuthentication` | no | `true` in Azure with App Service Authentication enabled |
| `VITE_API_BASE_URL` (SPA build) | in Azure | Function App origin; empty locally |

## License

MIT — see [LICENSE](LICENSE).
