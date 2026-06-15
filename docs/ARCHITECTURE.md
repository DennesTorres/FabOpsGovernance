# FabOps UI — Architecture

This solution is the **technology conversion** of the reference project's `FabOpsUI`
(React SPA + small FastAPI backend, hosted on Cloud Run) to the Azure-native, Visual
Studio-standard stack:

- the SPA moves to **Azure Static Web Apps** and adopts **CopilotKit v2** for the chat surface
  (per the AG-UI integration instructions), keeping the original pages, sign-in flow, and look;
- the backend becomes an **Azure Functions** app exposing the same three endpoints the
  original backend exposed, with the agent bridge preserved as a **streaming AG-UI relay**.

The agents (FabOps Orchestrator and its specialists) and the MCP access proxies are separate
systems owned by the agent team — this solution reaches them through one configured URL and
contains none of their logic. Scope and divergences are tracked in [DECISIONS.md](DECISIONS.md).

## System shape

```
┌──────────────────────────────┐      ┌──────────────────────────────────┐      ┌─────────────────────────┐
│  Azure Static Web App        │      │  Azure Functions (.NET 8 isol.)  │      │  The agent system       │
│  FabOps.Web (Vite + React)   │      │  FabOps.Api                      │      │  (external, configured  │
│                              │      │                                  │      │   via Agent:Url)        │
│  CopilotKitProvider          │ POST │  GET /api/config   readiness     │      │                         │
│   └─ HttpAgent ──────────────┼──────┼─ GET /api/secrets  MSAL ids      │      │  e.g. ADK agent served  │
│  CopilotChat (restyled)      │ SSE  │  POST /api/agent ──(relay)───────┼──────┼─ over AG-UI with        │
│  useComponent ×6             │◄─────┼──────────────────────────────────┼──────┼─ AGUIToolset(); its own │
│   render_table/donut/chart/  │      │  body + SSE pass through         │      │  tools / MCP proxies    │
│   card/badge/code            │      │  untouched, flushed per chunk    │      │  are its concern        │
│  MSAL (popup→redirect)       │      │                                  │      │                         │
└──────────────────────────────┘      └──────────────────────────────────┘      └─────────────────────────┘
```

## The three endpoints (same contracts as the reference backend)

| Endpoint | Response | Notes |
|---|---|---|
| `GET /api/config` | `{ "agent_url": string \| null }` | The configured `Agent:Url`; `null` makes the chat page show "agent not configured" (the RP's `FABOPS` behaviour) |
| `GET /api/secrets` | `{ "tenant_id", "client_id", "client_secret_set" }` | Sign-in configuration for MSAL; identifiers only — the secret never leaves the server. The RP UI's credential *write* path was dead code and is not reproduced (D06) |
| `POST /api/agent` | `text/event-stream` | Transparent AG-UI relay (below) |

## A chat turn, end to end

1. `CopilotChat` posts the AG-UI `RunAgentInput` — full message history, thread id, run id,
   and the declarations of every component registered with `useComponent` — to
   `POST /api/agent`, with the signed-in user's bearer token.
2. The function (optionally) checks the platform-validated principal (D08), then forwards the
   request body **byte-for-byte** to `Agent:Url` with `Accept: text/event-stream` and the
   optional configured downstream auth header.
3. The agent's SSE events stream back through the relay, which writes and flushes per chunk so
   the browser sees text deltas and tool calls as the agent produces them.
4. When the agent calls one of the six render tools, CopilotKit renders the matching React
   component inline, validating the (possibly still streaming) arguments against its Zod
   schema; other tool calls render as "Calling tool …" activity bubbles, like the original UI.
5. If the agent endpoint is unreachable or the stream fails, the relay emits an AG-UI
   `RUN_ERROR` event so the chat shows a readable message (the RP's `_sse_error` equivalent).

The relay holds no conversation state and interprets no payloads — protocol evolution between
CopilotKit and the agent does not require touching this API.

## Configuration

| Setting | Purpose |
|---|---|
| `Agent:Url` | The agent's AG-UI endpoint (the RP's `FABOPS`). Unset = UI shows "agent not configured" |
| `Agent:AuthHeaderName` / `Agent:AuthHeaderValue` | Optional header added to downstream requests (e.g. a shared secret). Name defaults to `Authorization` |
| `Entra:TenantId`, `Entra:ClientId` | Served to the SPA for MSAL sign-in |
| `Entra:ClientSecret` | Optional; only reported as `client_secret_set` (parity with the RP's config page) |
| `Entra:RequireAuthentication` | `true` in Azure with App Service Authentication enabled (D08) |
| `VITE_API_BASE_URL` (SPA build) | Function App origin; empty locally (Vite proxies `/api`) |

## Security

- SPA sign-in: MSAL popup with redirect fallback (RP parity), tenant/client served by
  `GET /api/secrets`.
- API protection in Azure: Function App **App Service Authentication** (Entra, "allow
  unauthenticated" mode) validates bearer tokens at the platform; with
  `Entra:RequireAuthentication=true` the agent relay refuses requests without a validated
  principal. `/api/config` and `/api/secrets` stay anonymous to bootstrap sign-in (identifiers
  only). CORS allows the SWA origin and the Vite dev origin.
- The downstream agent secret (if any) lives in Function App settings — never in the browser.

## Build, run, deploy

- **Open** `FabOpsGovernance.sln` in Visual Studio 2022 17.8+ (or 2026); *Azure development* +
  *JavaScript and TypeScript* workloads.
- **F5**: multi-project startup — `FabOps.Api` (Functions host, port 7071) + `FabOps.Web`
  (Vite dev server, port 5173, proxying `/api`).
- **Build**: `dotnet build` builds the .NET projects and restores the SPA's npm packages; the
  production bundle (`npm run build` → `dist/`) is produced by the deployment workflow.
- **Deploy**: `FabOps.Api` → right-click Publish (or `.github/workflows/deploy-api.yml`);
  `FabOps.Web` → the standard SWA workflow (`.github/workflows/deploy-web.yml`) on push.
- The SPA calls the Function App origin directly — deliberately not through the SWA `/api`
  proxy, whose hard 45-second request limit would cut off agent runs (D03).
