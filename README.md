# FabOps Governance

FabOps lets you govern Microsoft Fabric by writing a rule in plain English. You describe a policy the way you'd say it out loud — *"every workspace must have at least two security groups as admins"* — and FabOps turns it into a checkable rule, remembers it, and inspects your live Fabric tenant against it, telling you what passes and what fails, and why.

It is built for the **Microsoft Agents League — Reasoning Agents track** (June 2026) and runs on **Azure AI Foundry**.

---

## What it is

Every Microsoft Fabric tenant accumulates governance rules — naming conventions, capacity policies, access requirements, data-quality standards. They normally live in wiki pages nobody reads and one-off audit scripts nobody maintains. There is no single place where a rule is *written down*, *kept current*, and *actually checked* against the tenant.

FabOps makes governance **executable**. It is not a single chatbot; it is a small system of cooperating AI agents that together do three things with a policy you describe in plain language:

1. **Compile** your intent into a precise, machine-checkable rule.
2. **Store** that rule — versioned and searchable — so your rulebook is a managed asset, not a pile of scripts.
3. **Enforce** the rule by walking your live Fabric tenant, evaluating each object, and reporting pass/fail with evidence.

---

## What you can do with it

- **Author a rule in plain English.** "Every production lakehouse must be assigned to a capacity." FabOps writes the formal rule, shows it to you, and saves it on your confirmation.
- **Run a rule against your tenant** — the whole tenant or a single domain. You get a per-object pass/fail, each with the reason it passed or failed.
- **Manage the rulebook.** List, search, and version rules. FabOps detects when a new rule duplicates or supersedes an existing one and explains the difference rather than silently adding noise.
- **Ask how things work.** Questions about the rules, the rule language, or the process get grounded, cited answers.

A typical exchange:

> **You:** Run the admin-groups rule for the InterWorks domain.
> **FabOps:** Checked 12 workspaces in *InterWorks*. 9 pass, 3 fail. *Finance-Prod* is missing required admin group `FAB-Admins`; *Sales-Sandbox* … (results saved).

---

## How it works

You talk to one agent — the **Orchestrator** — and it stays in front of you the whole time, calling specialist agents behind the scenes and weaving their answers into its reply. A single "run this rule" request flows through the system like this, in plain terms:

1. You ask the Orchestrator to run a rule (optionally scoped to a domain).
2. It fetches the rule's definition from the store.
3. It hands that definition to a compiler agent, which turns it into an executable check and runs it against your live Fabric tenant.
4. An evaluator agent inspects each object and returns pass/fail/error with a reason.
5. The results are saved to the store, and the Orchestrator presents them to you.

Each step is handled by a different agent with a single, well-defined job. That separation is deliberate: when something goes wrong, the failure is traceable to one agent and one action, instead of being buried inside one giant prompt.

---

## The rule language (FRL)

The heart of FabOps is a small language called **FRL** (the FabricGuard Rule Language). Why a language instead of free text? Because "every workspace must have at least two admin groups" is not really a sentence — it is a rule with structure: a target type (`Workspace`), a property to inspect (admin role assignments), and a constraint (`count >= 2`). Free text loses that structure; FRL keeps it while staying readable:

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

The author writes *what* to check; the system decides *how* to evaluate it, based on the property being checked. The full reference is in [`docs/frl-language.md`](docs/frl-language.md).

---

## The agents

FabOps is a team of four reasoning agents, each owning one responsibility:

- **FabOps Orchestrator** — the front door. Understands your request and routes it: answer a question, author a rule, or run one. Always the one talking to you.
- **Rules Generator & Manager** — the rulebook. Turns English into FRL, checks for duplicates, manages versions, and persists run results.
- **FRL Compiler & Runner** — the executor. Compiles a rule's source into an executable check, scopes it (e.g. to one domain), and runs it.
- **Policy Checker** — the evaluator. Inspects the live Fabric tenant object by object and returns the verdicts.

The agents talk to each other peer-to-peer (A2A) and reach external systems through a common tool protocol (MCP). The deeper design — and how this repository's UI fits in — is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Architecture

Under the hood, the four agents run inside **Azure AI Foundry** (Azure OpenAI GPT-4.1), backed by **Azure Cosmos DB** as the rule/result store and a **Foundry IQ** knowledge base for grounded answers. Everything outside the agent boundary — the store, the knowledge base, and Microsoft Fabric — is reached over **MCP**.

![FabOps — architecture](docs/architecture-current.svg)

- **Azure Cosmos DB** — the governance store. Holds `governance-rules` (each rule, versioned, with its intent embedded for semantic dedup) and `governance-results` (one record per evaluated object). Reached via the Azure Cosmos DB MCP Toolkit; versioned writes go through a dedicated write tool.
- **Foundry IQ + Azure AI Search** — the knowledge base behind the Orchestrator's grounded answers, retrieved over MCP.
- **Fabric MCP** — exposes Fabric REST (workspaces, roles, domains, items) to the Policy Checker, plus a `list_workspaces_in_domain` tool for domain-scoped runs.

The complete architecture, the end-to-end pipeline, and the roadmap (async batch execution, in-UI rule editing, and the Spark/notebook data-plane path) are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## This repository — the UI and its API

The agents and their tool servers above are the larger FabOps solution. **This repository implements one component of it: the user interface and a thin API relay.** It is the Azure-native conversion of the reference project's `FabOpsUI` (a React SPA + small backend) to a Visual-Studio-standard Azure stack. It contains none of the agent logic — it reaches the deployed agent through one configured AG-UI endpoint URL.

```
FabOpsGovernance.sln
├── src/FabOps.Api      Azure Functions (.NET 8 isolated): /api/config, /api/secrets, /api/agent (SSE relay)
├── src/FabOps.Web      Vite + React + CopilotKit SPA
└── tests/FabOps.Tests  xUnit: endpoint contracts + relay behaviour
```

The SPA is built with **React + AG-UI + CopilotKit**: the user chats with the Orchestrator and the agent renders rich results inline by calling six display-only render tools (`render_table`, `render_donut`, `render_chart`, `render_card`, `render_badge`, `render_rule_source`). The `/api/agent` endpoint is a transparent **AG-UI relay** that forwards the request to the configured agent and streams its SSE events straight back, holding no conversation state.

**Run locally.** Open `FabOpsGovernance.sln` (Visual Studio 2022 17.8+/2026 with the *Azure development* + *JavaScript and TypeScript* workloads — or .NET 8 SDK + Node 20 + Azure Functions Core Tools). Fill `src/FabOps.Api/local.settings.json` (git-ignored) — at minimum `Agent__Url` and `Entra__TenantId` / `Entra__ClientId` — then start `FabOps.Api` + `FabOps.Web` (F5 multi-startup, or `func start` + `npm run dev`) and browse `http://localhost:5173`. `dotnet test` runs the unit tests with no cloud resources.

**Deploy.** API → **Azure Functions** (Flex Consumption, for HTTP streaming + long runs); Web → **Azure Static Web Apps**. The SPA calls the Function App origin directly (not the SWA `/api` proxy, whose 45-second limit would cut off long agent runs). Configuration and every deliberate divergence from the reference project are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

**Configuration**

| Setting | Required | Purpose |
|---|---|---|
| `Agent__Url` | yes | the deployed agent's AG-UI endpoint; unset → UI shows "agent not configured" |
| `Agent__AuthHeaderName` / `Agent__AuthHeaderValue` | no | optional header for the downstream agent (defaults to `Authorization`) |
| `Entra__TenantId`, `Entra__ClientId` | yes | served to the SPA for MSAL sign-in |
| `Entra__RequireAuthentication` | no | `true` in Azure with App Service Authentication enabled |
| `VITE_API_BASE_URL` (SPA build) | in Azure | Function App origin; empty locally |

---

## Technologies

| Layer | Technology |
|---|---|
| Reasoning model | Azure OpenAI **GPT-4.1** |
| Agent runtime | **Azure AI Foundry** Agent Service; agents communicate over **A2A** |
| Rule + result store | **Azure Cosmos DB for NoSQL** — vector search; `/rule_id` and `/run_id` partitions |
| Knowledge base | **Foundry IQ** + **Azure AI Search** (hybrid + rerank) |
| Tool protocol | **Model Context Protocol (MCP)** |
| Front end (this repo) | **React** + **AG-UI** + **CopilotKit**, on **Azure Static Web Apps** + **Azure Functions** |
| Target platform | **Microsoft Fabric** (Workspaces, Domains, roles, Lakehouses, Tables, MLVs, Notebooks) |

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the whole-solution architecture (agents, surfaces, current vs roadmap), and how this UI repo fits.
- [`docs/frl-language.md`](docs/frl-language.md) — the FRL language reference.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — UI conversion decisions and divergences.
- [`docs/ui-render-primitives.md`](docs/ui-render-primitives.md) · [`docs/ui-rendering-skill.md`](docs/ui-rendering-skill.md) — the generative-UI render tools and how the agent uses them.

## License

MIT — see [`LICENSE`](LICENSE).
