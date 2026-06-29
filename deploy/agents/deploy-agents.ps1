<#
.SYNOPSIS
  Create or update Azure AI Foundry agents in a project from the JSON files under ./definitions.

  This is the "set up all agents" half. It is idempotent: agents are matched by name and updated
  in place, or created if absent. Pair it with export-agents.ps1 (which produces the JSON files).

.DESCRIPTION
  Posts each definition to {project-endpoint}/assistants (create) or /assistants/{id} (update).
  A definition's "tools" array carries everything the agent needs — the AG-UI render functions
  (render_table / render_donut / render_chart / render_card / render_badge / render_rule_source),
  any MCP tools (e.g. the Cosmos MCP server), and connected-agent (A2A) links. This script does not
  invent those; it applies whatever the JSON contains.

.NOTES
  Requires: 'az login' as an identity with agent write on the Foundry resource — the built-in role
  "Azure AI Project Manager" grants it. See deploy/agents/README.md.

  Order matters for A2A: create the specialists first so their ids exist, then the orchestrator
  whose definition references them via connected_agent tools.

.EXAMPLE
  ./deploy-agents.ps1 -ProjectEndpoint https://<res>.services.ai.azure.com/api/projects/<project> -ModelDeployment gpt-4.1
#>
param(
  [Parameter(Mandatory)] [string] $ProjectEndpoint,
  [string] $ApiVersion = "2025-11-15-preview",
  [string] $DefinitionsDir = "$PSScriptRoot/definitions",
  [string] $ModelDeployment   # optional: override every agent's 'model' with this deployment name
)
$ErrorActionPreference = "Stop"

$token = az account get-access-token --resource "https://ai.azure.com" --query accessToken -o tsv
if (-not $token) { throw "No access token. Run 'az login' (with an identity granted 'Azure AI Project Manager' on the Foundry resource)." }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

$root = $ProjectEndpoint.TrimEnd('/')
$listUri = "$root/assistants?api-version=$ApiVersion&limit=100"
$existing = (Invoke-RestMethod -Method Get -Uri $listUri -Headers $headers).data
$byName = @{}
foreach ($e in $existing) { if ($e.name) { $byName[$e.name] = $e.id } }

$files = Get-ChildItem -Path $DefinitionsDir -Filter *.json | Where-Object { $_.Name -ne '_template.json' }
if (-not $files) { throw "No agent definitions in $DefinitionsDir. Run export-agents.ps1 first, or author them by hand." }

foreach ($f in $files) {
  $def = Get-Content $f.FullName -Raw | ConvertFrom-Json
  if ($ModelDeployment) { $def.model = $ModelDeployment }
  if (-not $def.model) { throw "$($f.Name): 'model' is empty. Set it to your GPT-4.1 deployment name, or pass -ModelDeployment." }
  $body = $def | ConvertTo-Json -Depth 40

  if ($byName.ContainsKey($def.name)) {
    $id = $byName[$def.name]
    $null = Invoke-RestMethod -Method Post -Uri ("$root/assistants/$id" + "?api-version=$ApiVersion") -Headers $headers -Body $body
    Write-Host "updated  $($def.name)  ($id)"
  }
  else {
    $created = Invoke-RestMethod -Method Post -Uri $listUri -Headers $headers -Body $body
    Write-Host "created  $($def.name)  ($($created.id))"
  }
}

Write-Host ""
Write-Host "Done. Set FabOps.Api's Agent__Url to the orchestrator agent's Responses endpoint:"
Write-Host "  $root/agents/<orchestrator-id>/endpoint/protocols/openai/responses?api-version=$ApiVersion"
