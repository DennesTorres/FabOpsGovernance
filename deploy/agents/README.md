# Foundry agent setup (export / deploy)

The four FabOps reasoning agents — **Orchestrator**, **Rules Generator & Manager**, **FRL Compiler & Runner**, **Policy Checker** — run in the **Azure AI Foundry Agent Service**. This folder turns them into reproducible code instead of portal clicks:

| Script | Direction | What it does | Role needed on the Foundry resource |
|---|---|---|---|
| [`export-agents.ps1`](export-agents.ps1) | Foundry → JSON | Captures each live agent's model, instructions, and tools into `definitions/<name>.json` | **Azure AI User** (read) |
| [`deploy-agents.ps1`](deploy-agents.ps1) | JSON → Foundry | Creates/updates the agents in a target project from `definitions/*.json` (idempotent, by name) | **Azure AI Project Manager** (write) |

`definitions/_template.json` documents the JSON shape. `definitions/*.json` (other than the template) are the agent definitions — produced by `export`, consumed by `deploy`, and hand-editable.

## The model

Foundry agents are **data-plane objects**, not ARM resources, so they are created through the Agents API rather than Bicep. The endpoint is the OpenAI-Assistants-compatible surface:

```
{project-endpoint}/assistants?api-version=2025-11-15-preview
# project-endpoint = https://<foundry-resource>.services.ai.azure.com/api/projects/<project>
```

An agent's `tools` array carries everything it needs:

- **AG-UI render tools** — `render_table`, `render_donut`, `render_chart`, `render_card`, `render_badge`, `render_rule_source` — as `function` tools. The API bridge (`FabOps.Api`) turns the agent's function-calls into AG-UI tool events that CopilotKit renders. (The SPA declares these client-side too, but the Foundry *prompt* agent owns its tools server-side, so they must exist on the agent — this is the "AG-UI tools setup" expanded to all agents.)
- **MCP tools** — e.g. the Cosmos governance store (`FabOps.CosmosMcp`) and the Fabric MCP.
- **connected_agent (A2A)** — the orchestrator references each specialist by id. Create specialists first, then the orchestrator.

## Usage

```powershell
az login   # an identity with the role(s) above on the Foundry resource

# 1) Capture the current agents (run against the source project):
./export-agents.ps1 -ProjectEndpoint https://<res>.services.ai.azure.com/api/projects/<project>

# 2) (Re)create them in a target project, optionally overriding the model deployment:
./deploy-agents.ps1 -ProjectEndpoint https://<res>.services.ai.azure.com/api/projects/<project> -ModelDeployment gpt-4.1
```

Then set `FabOps.Api`'s `Agent__Url` to the **orchestrator** agent's Responses endpoint (the script prints the shape).

## Granting the read role (the current blocker)

To `export` the live agents, the running identity needs **`…/agents/read`** on the Foundry resource. Grant the **Azure AI User** role on the Foundry account (run by someone with Owner / User Access Administrator on it, in *its* subscription):

```bash
az role assignment create \
  --assignee <client-or-object-id> \
  --role "Azure AI User" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<foundry-resource>"
```

`deploy` additionally needs write — grant **Azure AI Project Manager** the same way.
