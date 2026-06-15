# Known issues and workarounds

Documents the constraints this project hit while building on **Azure AI Foundry**, Azure Cosmos DB, and the Microsoft Fabric APIs, and how each was handled. Recorded here so reviewers (and our future selves) see deliberate engineering, not improvised duct tape.

## 1. The orchestrator must not send natural language to the evaluator

**Symptom:** in an early Foundry trace, the Orchestrator passed a **natural-language** description of the rule to the Policy Checker, which expects a structured `evaluate` spec. The Checker returned a `tool_user_error` and the run produced no per-object results.

**Root cause:** compilation (FRL source → `traverse` / `checks` spec) had been an inline step inside the Orchestrator's prompt. Under load the Orchestrator sometimes skipped the structured compile and forwarded prose.

**Fix (not a workaround — a design change):** compilation was **externalized into a dedicated agent**, the FRL Compiler & Runner. The Orchestrator now retrieves the rule's FRL **source** from the Rules Generator & Manager and hands *source + filter* to the Compiler & Runner, which compiles and runs it and returns per-object results. The Orchestrator never compiles FRL and never talks to the Policy Checker directly. This made the pipeline contract explicit and the failure class disappear.

## 2. Stored rules in an older FRL dialect fail to compile

**Symptom:** retrieving an existing rule returned its `frl_code` in a pre-v0.2 dialect (`RULE '…' FOR EACH fabric.Domain AS d … ASSERT workspaces.count() <= 3 … SEVERITY 'medium'`) rather than the v0.2 grammar (`RULE <id> { APPLIES_TO … CHECK … FINDING … }`).

**Root cause:** the FRL Compiler & Runner compiles the **v0.2 grammar**. The Rules Generator & Manager now authors v0.2, so *new* rules are v0.2, but rules stored before the grammar settled are in the old dialect and return a `compile_error`.

**Workaround for the bounded demo:** re-author the small set of pre-v0.2 rules through the copilot so they are stored in v0.2. (A longer-term option is to teach the Compiler to accept both dialects, or to pick one canonical dialect and align spec + copilot + stored rules to it.) The demo only runs v0.2 rules.

## 3. The Fabric MCP has no Domain-traversal tool

**Symptom:** a rule scoped to a *domain* (e.g. "run this for the InterWorks domain") could not be evaluated, because the Fabric MCP exposes no tool to list or resolve domains, so the Policy Checker had nothing to traverse from.

**Fix:** a small custom tool, **`list_workspaces_in_domain(domain)`**, performs two Fabric admin REST calls — resolve the domain *name* → domain id, then list the workspaces assigned to that domain — and returns the workspace set. The Policy Checker resolves a `Domain` scope by calling this tool and continues traversal from its result; it never attempts to enumerate a `Domain` type directly.

**Permission note:** both calls are **admin** Fabric APIs, so the Fabric connection's identity needs **`Tenant.Read.All`** (a read-only scope). A `401/403` on the first call means that grant is missing; nothing in code changes once it is granted.

## 4. The Cosmos DB MCP Toolkit is read/search-only

**Symptom:** the published Azure Cosmos DB MCP Toolkit tools cover reads, schema discovery, and search (`list_databases`, `list_collections`, `get_recent_documents`, `find_document_by_id`, `text_search`, `vector_search`, `get_approximate_schema`) — but **not** the versioned writes the system needs (`save_rule`, `save_results`).

**Fix:** a dedicated **write tool** (an Azure Function using the Cosmos SDK + managed identity) provides exactly those two operations, preserving the contracts the Rules Generator & Manager already calls. `save_rule` embeds `nl_intent` and, in one **transactional batch within the `/rule_id` partition**, retires the prior current document (`is_current=false`) and inserts the new `<rule_id>_v<version>` (`is_current=true`). `save_results` bulk-upserts the results array partitioned by `/run_id`. Because the toolkit and the write tool are split, the agent prompt only ever models "the storage" and is unaffected by which tool serves a given operation.

**Related risk — vector recall.** Moving the semantic dedup/retrieve step from a sparse-embedding index to Cosmos DB vector search can change recall. Mitigation: tune the embedding model and use **hybrid** (`text_search` + `vector_search`) for dedup/retrieve, validated against known queries before cutover.

## 5. The data-plane (notebook) evaluation path is deferred

The FRL namespaces `delta.*`, `schema.*`, `access.*`, and `spark.*` require Spark to read the Fabric data plane and therefore run as Fabric notebooks. That path is **on the roadmap**, not in the demo. The demo evaluates rules whose checks resolve through Fabric **metadata** (the MCP-direct path). FRL still *accepts* data-plane rules — they simply route to the notebook path once it ships (see the future architecture diagram and `ARCHITECTURE.md`).

## 6. Carrying conversational context into each turn

A governance conversation refers back to "this rule" across turns ("show me the admin rule" → "now run it for InterWorks"). For the agent to resolve "it," the front end must carry the conversation thread/history into each turn over AG-UI. If a turn arrives without prior context, the agent correctly asks the user to name the rule rather than guessing. This is a front-end responsibility (pass the thread), not a prompt fix — the prompt's fallback (ask which rule, show the current rules with their codes) is the safe behavior when context is absent.

## Reproducibility

Each item above is addressed by a concrete artifact in this repository — the FRL Compiler & Runner agent (items 1–2), the `list_workspaces_in_domain` custom tool (item 3), the Cosmos write tool (item 4) — so the behavior is reproducible against a fresh Azure deployment, not dependent on a one-off manual fix.
