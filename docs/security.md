# Security model and trade-offs

This document describes how FabOps authenticates between its components on Azure, what the public-repo exposure surface looks like, and the trade-offs accepted for the hackathon submission window.

## Auth model — the layered picture

```
┌───────────────────────────────────────────────────────────────────────────┐
│  User (or reviewer)                                                         │
│      │  authenticated session in the React UI                              │
│      ▼                                                                      │
│  AG-UI / CopilotKit runtime  ──▶  Azure AI Foundry agent endpoint           │
│      │                                                                      │
│      │  A2A between agents inside the Foundry project                       │
│      ▼                                                                      │
│  FabOps agents (Orchestrator, Rules Manager, FRL Compiler, Policy Checker)  │
│      │                                                                      │
│      ├─ MCP ──▶ Cosmos DB MCP Toolkit ──(Entra ID / managed identity)──▶ Azure Cosmos DB
│      ├─ MCP ──▶ Cosmos write tool (Azure Function) ─(managed identity)──▶ Azure Cosmos DB
│      ├─ MCP ──▶ Foundry IQ / Azure AI Search ──────────────────────────▶ Project docs
│      └─ MCP ──▶ Fabric MCP + list_workspaces_in_domain ─(SP/MI)─────────▶ Microsoft Fabric tenant
└───────────────────────────────────────────────────────────────────────────┘
```

The Azure build's design intent is **Microsoft Entra ID / managed identity end to end**, with least-privilege data-plane RBAC and no account keys in production.

## Auth by boundary

- **Cosmos DB MCP Toolkit → Cosmos DB.** The toolkit (hosted on Azure Container Apps, added to Foundry as a custom tool) authenticates with **Microsoft Entra ID** using its managed identity, which is granted least-privilege Cosmos **data-plane RBAC** (read for the read toolkit) plus the toolkit's `Mcp.Tool.Executor` role.
- **Cosmos write tool → Cosmos DB.** The Azure Function that serves `save_rule` / `save_results` uses its own **managed identity** with **Contributor**-level data-plane RBAC scoped to the `fabops-governance` database. No connection string or account key is stored in the repo or in deploy-time environment variables.
- **Agents → Fabric.** Fabric REST is reached through the Fabric MCP layer using a **service principal / managed identity**. The domain-resolution route (`list_workspaces_in_domain`) calls Fabric **admin** APIs, which require the identity to hold **`Tenant.Read.All`** — a read-only scope.
- **Knowledge base.** Foundry IQ / Azure AI Search retrieval runs inside the Foundry project's trust boundary and is reached via `knowledge_base_retrieve` (MCP); it serves the project's own documents only.

## What's exposed in the public repo

When the code goes public for judging, the following become public:

**Public by design (no exposure concern):**
- The agent definitions and prompts for each agent.
- The deployment configuration (Foundry agent setup, Container App / Function deploy scripts).
- The MCP tool server URLs.
- The architecture, FRL reference, known-issues, and this security document.
- MIT license terms.

**Material exposure to manage — the custom-tool proxy secret.** The Fabric proxy route (`list_workspaces_in_domain`, and any other route on the same proxy) checks an inbound shared secret passed as an `X-Proxy-Secret` header. If that secret were committed, anyone could call the proxy directly. It must be kept out of the repo — supplied to the Foundry custom tool's connection configuration, not hard-coded in source.

**Not exposed:**
- The Cosmos DB account key (not used — managed identity instead).
- Any Azure OpenAI / Foundry keys (the agents authenticate within the project).
- The Fabric service principal credentials (held by the proxy/connection, not in the repo).

## Mitigations applied for the submission window

1. **Least-privilege everywhere.** The Fabric identity is read-only (`Tenant.Read.All` for admin reads; read-only on the demo workspaces). The Cosmos read identity is read-only; only the write tool's identity can write, and only to the `fabops-governance` database. The worst case from a leaked proxy secret is limited to the demo Fabric reads and the single governance database — nothing else in the tenant is reachable.
2. **No secrets in source.** Keys are replaced by managed identities; the one shared secret (the proxy header) lives in connection configuration, not in committed code.
3. **Bounded exposure window with planned rotation.** Any shared secret in use during judging is rotated when the judging window closes; old values become invalid, so any value left in commit history no longer authenticates.
4. **Reviewers reach the system through the Foundry agent endpoint**, gated by the project's authentication — not by calling the MCP servers or proxy routes directly.

## What we'd do differently in production

The roadmap (tracked in the architecture register) hardens this further:

1. **Pass-through authentication** — the user's identity propagates from the UI all the way to Fabric and to the store, so Fabric's row/column-level security and Cosmos RBAC apply to the *actual* user, not a shared service-account view (register items A12, A13).
2. **Replace the proxy shared secret** with OAuth2 client credentials or managed-identity-to-managed-identity auth, removing the header secret entirely.
3. **Guardrails on the demo Fabric environment** to bound what any run can touch (register item A14).
4. **Audit-log every governance-rule mutation** with the user's identity and the prior version's checksum, so the rule store is itself governable.

## Reporting a security issue

If you find a vulnerability during the judging window or after, please open a GitHub issue with the `security` label, or email the submission contact listed in the entry form. We will respond promptly.
