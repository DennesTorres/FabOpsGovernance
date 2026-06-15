# FabOps Governance

> Govern Microsoft Fabric by writing a rule in plain English. FabOps turns it into a small rule language, stores it, compiles it, and sends an agent to enforce it against your live Fabric tenant — then shows you what passed and what failed, with the reason.

Built for the **Microsoft Agents League — Reasoning Agents track** (June 2026). FabOps is a multi‑agent reasoning system running on **Azure AI Foundry** (Azure OpenAI GPT‑4.1), backed by **Azure Cosmos DB** as its memory and a **Foundry IQ** knowledge base for grounded answers.

![FabOps — current architecture](docs/architecture-current.svg)

---

## The problem

Every Microsoft Fabric tenant accumulates governance rules — naming conventions, capacity policies, access requirements, data‑quality standards. They normally live in wiki pages nobody reads and one‑off audit scripts nobody maintains. There is no single place where a rule is *written down*, *kept current*, and *actually checked* against the tenant.

FabOps makes governance **executable**. You describe a policy the way you'd say it out loud — *"every workspace must have at least two security groups as admins"* — and the system does three things: it **compiles** your intent into a rule expressed in a small purpose‑built language; it **stores** that rule, versioned and semantically searchable, so the rulebook is a managed asset rather than a pile of scripts; and it **enforces** the rule by sending an agent to walk your live Fabric tenant, evaluate each object, and report pass or fail with evidence.

FabOps is not a single chatbot. It is a governance *system*: a language for expressing rules, agents that author / compile / run them, a memory that remembers them, and a knowledge base that explains them.

---

## How the whole system works

```
            ┌──────────────────────── Azure AI Foundry (GPT-4.1, agents over A2A) ────────────────────────┐
  You  ───▶ │  FabOps Orchestrator                                                                          │
 (plain     │     ├─ author ─▶ Rules Generator & Manager ─▶ (Cosmos DB)  governance-rules                   │
  English)  │     ├─ run    ─▶ FRL Compiler & Runner ─▶ Policy Checker ─▶ (Fabric MCP) Microsoft Fabric     │
            │     └─ explain ─▶ Foundry IQ knowledge base (Azure AI Search over the project docs)           │
            └───────────────────────────────────────────────────────────────────────────────────────────────┘
                         results persisted to (Cosmos DB) governance-results, then presented back to you
```

A single request — *"run the admin‑groups rule for the InterWorks domain"* — flows: **Orchestrator** (routes intent) → **Rules Generator & Manager** (retrieves the rule's source from Cosmos DB) → **FRL Compiler & Runner** (compiles the rule + scope, runs it via Policy Check) → **Policy Checker** (evaluates each object against the live Fabric tenant) → **Rules Generator & Manager** (persists the results) → **Orchestrator** (presents the pass/fail outcome).

Each step is a distinct agent with a single responsibility, communicating peer‑to‑peer over **A2A** and reaching external systems over **MCP**. That keeps the audit trail legible: a failure is attributable to one agent and one tool call, not buried inside a monolithic prompt.

---

## The core idea — FRL, a governance rule language

The intellectual center of FabOps is **FRL — the FabricGuard Rule Language**.

"Every workspace must have at least two admin groups" is not really a sentence; it is a rule with structure: a target type (`Workspace`), a property (admin role assignments), and a constraint (`count >= 2`). If governance lives only as free text, that structure is lost and nothing can be evaluated mechanically. FRL captures the structure while staying human‑readable:

```
RULE ws-admin-groups-001 {
    NAME:       "Workspace must have designated Entra admin groups"
    VERSION:    "1.0.0"
    SEVERITY:   ERROR
    APPLIES_TO: Workspace

    PARAMS { admin_groups: List<EntraGroup> }

    CHECK SELF.PERMISSIONS(ADMIN).list CONTAINS_ALL $admin_groups

    FINDING:     "Workspace {displayName} is missing required admin groups: {missing_groups}"
    REMEDIATION: "Add the missing groups as Workspace Administrators in Fabric settings"
}
```

The language is deliberately open: `APPLIES_TO` accepts any Fabric item‑type string, and properties are addressed as `SELF.<path>`, so new item types and fields Microsoft adds are usable immediately with no language change. Its governing principle is **the property decides the execution path** — the author writes *what* to check, and the property's namespace decides *how* it's evaluated (Fabric metadata via MCP today; Spark notebooks on the roadmap). Full reference: [`docs/frl-language.md`](docs/frl-language.md).

---

## The agents

Four reasoning agents run inside Azure AI Foundry, communicating over A2A (call/return — the Orchestrator stays in front of the user and never transfers the conversation away).

- **FabOps Orchestrator** — the front door. Routes every request into one of three lanes: **explain** (answer a question about the system / FRL / roadmap, grounded by the Foundry IQ knowledge base), **author** (create or manage a rule), or **run** (evaluate a rule against the tenant). It composes each specialist's reply into its own response.
- **Rules Generator & Manager** — the rulebook. Translates natural language into FRL, reconciles wording against real Fabric terminology, and **vector‑searches the existing rules before saving** so duplicates and re‑phrasings are caught. Owns the full lifecycle (list, count, search, retrieve a rule's FRL source, version) and **persists run results**. Rules are immutable — a change is always a new version.
- **FRL Compiler & Runner** — the executor. Given a rule's FRL **source** + an optional **scope/filter**, it resolves scope against the Fabric containment chain (Domain → Workspace → item), classifies each `CHECK` by namespace, **compiles** the rule into the Policy Checker's executable spec, and **runs** it — returning per‑object pass/fail/error, or a `compile_error`.
- **Policy Checker** — the evaluator. Inspects the live Fabric tenant through the Fabric MCP layer (resolving a `Domain` to its workspaces via `list_workspaces_in_domain`), applies the rule's operators, and returns a verdict per object with the reasoning behind it.

---

## Data and knowledge surfaces

Everything outside the agent boundary is reached over **MCP**, so the agents talk to storage, Fabric, and the knowledge base through one consistent pattern.

- **Azure Cosmos DB — the system's memory.** A NoSQL database `fabops-governance` with two containers: **`governance-rules`** (partition `/rule_id`) stores each rule with its natural‑language intent embedded for **vector search** (semantic dedup), versioned with `rule_id` + `version` + a single `is_current` per rule; **`governance-results`** (partition `/run_id`) stores one document per evaluated object plus the run's scope. Agents read and `vector_search` through the **Azure Cosmos DB MCP Toolkit**; the versioned writes (`save_rule`, `save_results`) come from a dedicated write tool.
- **Foundry IQ — the knowledge base.** Backs the Orchestrator's *explain* answers via **Azure AI Search** (hybrid retrieval + reranking) over the project's own documents, returning cited results through `knowledge_base_retrieve` (MCP).
- **Fabric MCP — the live tenant.** Exposes Fabric REST as MCP tools (workspaces, roles, domains, items), plus a `list_workspaces_in_domain` tool for domain‑scoped runs.

---

## This repository — the UI and its bridge API

The system's face is a **React** app: the user chats with the Orchestrator and sees results rendered inline. The agent↔UI connection is **AG-UI** (an SSE event stream); a **CopilotKit** runtime routes UI tools and renders generative UI declaratively — the agent emits *data + "render as table / donut / chart"* and the front end draws it.

> **Scope of this repository.** This repo is a **full-stack component** of the FabOps solution: the React/CopilotKit SPA **and** a .NET Azure Functions backend that bridges it to the agent. The four reasoning agents and their MCP tool servers (Cosmos, Fabric, Foundry IQ) are **separate components**, owned by the agent side — this app holds none of their logic. It reaches the deployed agent over one configured **OpenAI-Responses** endpoint, and its API is **not** a passthrough: it translates **AG-UI ⇄ Responses** and authenticates with the Function App's managed identity (details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)).

**Solution layout**

```
FabOpsGovernance.sln
├── src/FabOps.Api      Azure Functions (.NET 8 isolated): /api/config, /api/secrets, /api/agent (AG-UI⇄Responses bridge)
├── src/FabOps.Web      Vite + React + CopilotKit SPA
└── tests/FabOps.Tests  xUnit: endpoint contracts + bridge behaviour
```

The SPA registers six display-only render tools the agent can call — `render_table`, `render_donut`, `render_chart`, `render_card`, `render_badge`, `render_code`. Their contract is [`docs/ui-render-primitives.md`](docs/ui-render-primitives.md); how the agent should use them is [`docs/ui-rendering-skill.md`](docs/ui-rendering-skill.md). The `/api/agent` endpoint is an **AG-UI ⇄ OpenAI-Responses bridge**: it validates the caller's Entra token, translates the AG-UI run into a Responses request (forwarding the user/assistant turns), calls the agent's Responses endpoint with a **managed-identity** bearer token, and translates the streamed Responses events back into AG-UI text and tool-call events — with a keep-alive heartbeat for long runs.

**Run locally**

1. Open `FabOpsGovernance.sln` (Visual Studio 2022 17.8+/2026, *Azure development* + *JavaScript and TypeScript* workloads — or .NET 8 SDK + Node 20 + Azure Functions Core Tools).
2. Fill `src/FabOps.Api/local.settings.json` (git-ignored) — at minimum `Agent__Url` (the agent's OpenAI-Responses endpoint) and `Entra__TenantId` / `Entra__ClientId` for sign-in.
3. Start `FabOps.Api` + `FabOps.Web` (F5 multi-startup, or `func start` + `npm run dev`), then browse `http://localhost:5173`. `dotnet test` runs the unit tests with no cloud resources.

**Deploy to Azure** — API → **Azure Functions** (Flex Consumption, for HTTP streaming + long runs); Web → **Azure Static Web Apps**. The SPA calls the Function App origin directly (not the SWA `/api` proxy, whose 45-second limit would cut off agent runs). See [`docs/DECISIONS.md`](docs/DECISIONS.md) for every deliberate divergence from the reference project.

**Configuration**

| Setting | Required | Purpose |
|---|---|---|
| `Agent__Url` | yes | the agent's Azure OpenAI **Responses** endpoint (including any `api-version`); unset → UI shows "agent not configured" |
| `Agent__TokenScope` | no | Entra scope the managed identity requests for the agent (defaults to `https://ai.azure.com/.default`) |
| `Entra__TenantId`, `Entra__ClientId` | yes | served to the SPA for MSAL sign-in |
| `Entra__ClientSecret` | no | only reported as `client_secret_set`; never served to the browser |
| `Entra__RequireAuthentication` | no | `true` in Azure to gate `/api/agent` on a validated Entra bearer token |
| `VITE_API_BASE_URL` (SPA build) | in Azure | Function App origin; empty locally (Vite proxies `/api`) |

---

## Technologies

| Layer | Technology |
|---|---|
| Reasoning model | Azure OpenAI **GPT‑4.1** |
| Agent runtime | **Azure AI Foundry** Agent Service; agents communicate over **A2A** |
| Rule + result store | **Azure Cosmos DB for NoSQL** — vector search; `/rule_id` and `/run_id` partitions |
| Knowledge base | **Foundry IQ** + **Azure AI Search** (hybrid + rerank), agentic retrieval |
| Tool protocol | **Model Context Protocol (MCP)** — Cosmos DB MCP Toolkit, Fabric MCP, knowledge‑base retrieve |
| This repository (UI + bridge API) | **React** + **AG‑UI** + **CopilotKit**, on **Azure Static Web Apps** + **Azure Functions** |
| Target platform | **Microsoft Fabric** (Workspaces, Domains, roles, Lakehouses, Tables, MLVs, Notebooks) |
| Language design | **FRL** — declarative, interpreted, namespace‑routed |

---

## Roadmap — the future architecture

The next release keeps everything above and adds the three items below (full design in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)).

![FabOps — future architecture / roadmap](docs/architecture-future.svg)

- **Async Batch Runner** — large jobs (a rule across many objects, or many rules at once) run asynchronously and scale out.
- **In‑UI FRL source editing** — edit a rule's FRL directly in the React UI, not only through the authoring conversation.
- **Fabric Notebook (Spark) analysis** — the deferred data‑plane path; checks in the `delta.*`, `schema.*`, `access.*`, `spark.*` namespaces run as Spark jobs in a Fabric notebook.

Further items tracked in the architecture register: pass‑through authentication to Fabric and the store, guardrails on the demo environment, OpenAPI tool isolation, multi‑tenant Fabric targeting, an execution router (MCP‑direct / notebook / batch), filtered execution with subset‑aware result comparison, scope validation that refuses an over‑broad run, and a short typable rule key (`R1`, `R2`, …).

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the whole‑solution architecture (agents, surfaces, current vs roadmap), and how this UI repo fits.
- [`docs/frl-language.md`](docs/frl-language.md) — the FRL language reference.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — UI conversion decisions and divergences.
- [`docs/ui-render-primitives.md`](docs/ui-render-primitives.md) · [`docs/ui-rendering-skill.md`](docs/ui-rendering-skill.md) — the generative‑UI render tools and how the agent uses them.
- [`docs/known-issues.md`](docs/known-issues.md) · [`docs/security.md`](docs/security.md) — platform/tooling caveats, and the solution-wide auth model and trade-offs.

## License

MIT — see [`LICENSE`](LICENSE).

---

_Track: Microsoft Agents League — Reasoning Agents. Demo scope: the bounded **InterWorks** domain._
