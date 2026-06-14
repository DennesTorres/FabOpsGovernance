# Decision Log

Decisions for the FabOps UI technology conversion, including every point where this
implementation deliberately diverges from the reference project (RP, `GagentHackaton`) or from
the AG-UI integration instructions that accompanied the task.

Format: each decision states the context, the decision, and the consequence.

---

## D01 — Scope: this repo converts FabOpsUI only; agents and proxies are external systems

**Context.** The RP contains several deployables: the UI (`FabOpsUI` — a React SPA plus a
small FastAPI backend), the agents (`FabOpsOrchestrator`, `FabOpsCopilot`, `FabOpsPolicyCheck`,
`FabOpsNotebookRetrievalAgent` on Vertex AI Agent Engine), and MCP access proxies
(`ProxyElastic`, `PureFabric`, `proxy` on Cloud Run).

**Decision.** This solution is the technology conversion of **FabOpsUI and nothing else**:
the SPA moves to Azure Static Web Apps, and the FastAPI backend becomes an Azure Functions
app with the same three endpoints (`GET /api/config`, `GET /api/secrets`,
`POST /api/agent`). The agents and the MCP proxies are not rebuilt, not wrapped, and not
re-hosted — they remain whatever the agent team deploys, reached through one configured URL
(`Agent:Url`, the equivalent of the RP's `FABOPS` setting).

**Consequence.** The backend has no model SDKs, no storage, no Fabric access and no business
logic — those belong to the agent system. The frontend talks to the same three endpoints it
always did.

## D02 — Backend host: Azure Functions (.NET 8 isolated), streaming preserved

**Context.** The requirement allows Azure Functions "but the streaming feature from the agent
to the app should stay available," with an invitation to propose an alternative if streaming
is impossible.

**Decision.** Azure Functions is kept. The .NET isolated worker with **ASP.NET Core
integration** gives the function direct access to `HttpResponse`, and chunks written and
flushed incrementally are forwarded by the Functions host as they are produced. Server-Sent
Events therefore relay end-to-end (verified locally with curl: chunked `text/event-stream`
responses arrive event by event). The Flex Consumption plan is recommended: it supports HTTP
streaming and defaults to a 30-minute request timeout (classic Consumption caps at 10).

**Consequence.** No alternative host needed. `POST /api/agent` is a regular HTTP-triggered
function.

## D03 — The SPA calls the Function App directly, not through the Static Web App proxy

**Context.** Azure Static Web Apps can link a backend under `/api` of the SWA origin, but that
proxy has a **documented hard limit of 45 seconds per request** (managed functions and linked
backends alike). Agent runs that walk a Fabric tenant routinely exceed it.

**Decision.** The frontend is hosted on SWA, but API calls go straight to the Function App
origin with CORS enabled. The base URL is baked in at build time (`VITE_API_BASE_URL`);
locally it is empty and the Vite dev server proxies `/api` to the Functions host.

**Consequence.** No 45-second ceiling on agent runs; SWA does what it is good at (global
static hosting, free SSL).

## D04 — `/api/agent` is a transparent AG-UI relay (the RP's bridge, minus the Vertex coupling)

**Context.** The RP's `backend/main.py` did two jobs: bridge the UI to the agent, and
*translate* between AG-UI and Vertex Agent Engine's `streamQuery` protocol (including a
session-id workaround), because Agent Engine does not speak AG-UI. The AG-UI integration
instructions state the agent side will adopt `AGUIToolset()` — which is ADK's AG-UI
integration, i.e. the agent will be exposed over an AG-UI-compatible endpoint.

**Decision.** The new `/api/agent` is a **pass-through relay**: it forwards the AG-UI request
body untouched (messages, frontend tool declarations, state, forwarded props), adds an
optional configured auth header for the downstream (`Agent:AuthHeaderName/AuthHeaderValue`,
covering patterns like the RP proxies' shared secret), and streams the SSE response back,
flushing per chunk. Failures surface as an AG-UI `RUN_ERROR` event, like the RP's
`_sse_error`. No Vertex-specific translation is reproduced.

**Consequence.** Anything the frontend and the agent agree on — including the six `render_*`
component tools — works without this API knowing about it. **Note for the agent team:** the
relay assumes the agent URL speaks AG-UI (e.g. an ADK agent served through ADK's AG-UI
integration with `AGUIToolset`). Vertex Agent Engine's bare `:streamQuery` endpoint does not
speak AG-UI and has no channel for the frontend tool declarations; pointing `Agent:Url` at it
would require reintroducing a translation layer like the RP's, and frontend tools would not
reach the model.

## D05 — Frontend: CopilotKit v2 with `selfManagedAgents` + `HttpAgent` (no Node runtime tier)

**Context.** The task requires CopilotKit. CopilotKit's default samples insert a Node "Copilot
Runtime" between browser and agent; this architecture has no Node backend, and routing the
stream through SWA-managed functions would hit the 45 s limit (D03). The RP itself talks AG-UI
from the browser with `@ag-ui/client`'s `HttpAgent`.

**Decision.** The SPA uses **CopilotKit v2** (`@copilotkit/react-core/v2`) with the
production-supported `selfManagedAgents` provider prop, registering an `HttpAgent` that points
at `POST /api/agent`. No CopilotKit runtime, no CopilotKit Cloud.
(`agents__unsafe_dev_only` is *not* used; its "unsafe" concern — shipping model credentials to
the browser — does not arise because the browser only ever holds the user's own Entra token.)

**Consequence.** One moving part fewer; streaming end-to-end; components registered with
`useComponent` are forwarded automatically in `RunAgentInput.tools`.

## D06 — Features of the RP UI that are intentionally NOT implemented (unused/dead/broken)

| RP element | Evidence | Status here |
|---|---|---|
| `SecretsPage.tsx` | A second, separate page imported by nothing; no route in `App.tsx` | Not ported (it is dead; the routed ConfigPage covers the same ground) |
| `POST /api/secrets` (credential *write* path behind ConfigPage's "Custom Authentication" tab) | UI calls it, but the RP backend implements only `GET /api/secrets`; `AuthProvider.login(saveToSecrets=true)` is never invoked | The ConfigPage UI (tabs + form) is reproduced **verbatim for visual parity** (see D10); the backend still does not implement the write, so Save errors exactly as it effectively did in the RP. The form's resting appearance — what must match — is identical |
| Vertex session state (`STATE_SNAPSHOT` with `vertexSessionId`) | A workaround for `streamQuery`'s session model — the RP forwarded only the last user message and kept history server-side | Dropped: AG-UI sends the full thread per run, and the relay forwards whatever the protocol carries |
| `frontend/preview.html` | Static design mockup, not referenced by the Vite build | Not ported |
| `VITE_BACKEND_URL` partial indirection | Used by 2 of 5 fetch sites in the RP — inconsistent leftover | Replaced by one consistent `VITE_API_BASE_URL` |

(The notebook-execution path and the standalone Copilot/PolicyCheck deployments are agent-side
concerns and therefore out of scope per D01.)

## D07 — Conflicts found in the AG-UI integration instructions (analysed, with resolutions)

1. **"Keep the tool names identical to `ui-render-primitives.md` and `ui-rendering-skill.md`."**
   Those files **do not exist** in the reference project (verified: no `*render*` file
   anywhere, no agent-skills directory). Resolution: this repo *authors* both documents
   ([ui-render-primitives.md](ui-render-primitives.md), [ui-rendering-skill.md](ui-rendering-skill.md));
   they are now the canonical contract between the frontend components and the agent.

2. **"On the ADK agent side, the only change is adding `AGUIToolset()`…"** — that is an
   agent-side change and the agents are out of scope here (D01). The instruction is satisfied
   on this side of the wire: the components are registered with `useComponent`, CopilotKit
   forwards them in `RunAgentInput.tools`, and the relay passes them through untouched. See
   D04's note about exposing the agent over an AG-UI endpoint for `AGUIToolset` to receive them.

3. **"Build the chat UI on CopilotKit (v2, AG-UI)" vs. the RP, which does not use CopilotKit**
   (raw `@ag-ui/client` with a hand-built chat surface; CopilotKit is only *mentioned* in the
   RP's README). Resolution: instructions win — the chat surface is CopilotKit's `CopilotChat`,
   restyled with the RP's visual language; the page shell (header, hints, clear-conversation)
   is preserved.

4. **"The surface renders components, not markdown" conflicts with the RP orchestrator prompt**,
   which instructs the agent to present results as a markdown table with ✅/❌/⚠️. That prompt
   belongs to the agent team; [ui-rendering-skill.md](ui-rendering-skill.md) documents the
   presentation rules they need to fold into it for the component rendering to be used.

## D08 — Authentication: MSAL (SPA) + optional platform validation at the Function App

**Context.** The RP gates the UI with MSAL (popup → redirect fallback) using tenant/client ids
served by the backend; its agent endpoint is effectively anonymous (hackathon shortcut).

**Decision.** The MSAL gate is kept identical. In Azure, enable the Function App's
**App Service Authentication** (Entra, "allow unauthenticated" mode) and set
`Entra:RequireAuthentication=true`: the agent relay then refuses requests without a
platform-validated principal (one header check — no bespoke JWT code), while `/api/config` and
`/api/secrets` stay anonymous because they bootstrap the sign-in page (identifiers only, never
the secret). Locally everything is anonymous. The SPA attaches the signed-in user's token to
agent calls.

**Consequence.** Same UX, materially safer than the RP, validation stays in the platform.

## D09 — Visual Studio solution layout

**Decision.** One `FabOpsGovernance.sln` with standard project types only:

| Project | Type | Role |
|---|---|---|
| `FabOps.Api` | Azure Functions (isolated, net8.0) | `/api/config`, `/api/secrets`, `/api/agent` SSE relay |
| `FabOps.Web` | esproj (JavaScript Project System) | Vite + React + CopilotKit SPA |
| `FabOps.Tests` | xunit | Endpoint contracts and relay behaviour |

F5 runs Functions + Vite together via multi-project startup; `FabOps.Api` publishes from
Visual Studio; the SPA deploys with the standard SWA GitHub Actions workflow.

## D10 — Visual parity with the reference UI (the two UIs must be indistinguishable)

**Context.** The two UIs may be used interchangeably — one might need to stand in for the other
— so they must be visually identical right now. The shell (landing, header, nav, loading,
config) is reproduced from the reference's own `app.css` verbatim; the chat is the one surface
that is intentionally different technology (CopilotKit, per the instructions) and must stay as
CopilotKit, not be downgraded to the reference's hand-built chat.

**Two things had to be reconciled:**

1. **Config page.** An earlier cleanup had trimmed it to a read-only view. Restored verbatim:
   the Sample / Custom Authentication tabs and the credential form, original wording included
   (see the D06 update). Resting appearance now matches the reference exactly.

2. **Stylesheet isolation.** CopilotKit v2 ships **Tailwind CSS v4** under cascade layers
   (`properties / theme / base / components / utilities`). Two interactions had to be handled:
   - *CopilotKit → shell:* none. CopilotKit's preflight is self-scoped to `[data-copilotkit]`
     (verified in its compiled CSS), so it never touches the shared pages.
   - *shell → chat:* the reference `app.css` opens with an **unlayered** `* { margin:0; padding:0 }`
     reset, and unlayered CSS beats layered CSS — so it would override CopilotKit's spacing
     utilities inside the chat and cramp its layout. Fix: that single reset rule is wrapped in
     the lowest cascade layer (`@layer reset`, order declared in `styles/layers.css`). On the
     shared pages nothing competes with it, so the shell is byte-for-byte unchanged; inside the
     chat, CopilotKit's `utilities` layer now wins. The reference's component rules stay
     unlayered, so they always win on the shell.

**Consequence.** Shell pages render purely from the reference stylesheet (identical); the chat
renders as CopilotKit intends. The only deliberate, sanctioned visual difference is the chat
surface itself.

**Verification note.** Confirmed structurally (built bundle: reference reset in `@layer reset`,
shell classes unlayered, CopilotKit scoped to `[data-copilotkit]`) and via the served modules.
A final side-by-side eyeball is still worth doing on first F5 — the browser-preview screenshot
tool was unresponsive in this environment, so pixel diffing could not be automated here.
