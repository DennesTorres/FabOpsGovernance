<#
.SYNOPSIS
  Export every agent in an Azure AI Foundry project to a JSON file under ./definitions.

  This is the "read the live configuration" half of the agent setup: it captures each agent's
  real model, instructions, and tools (including MCP tools and connected-agent A2A links), so the
  agents become reproducible code instead of portal clicks.

.DESCRIPTION
  The Foundry Agent Service exposes agents over the OpenAI-Assistants-compatible surface at
  {project-endpoint}/assistants. This script lists them and writes one <agent-name>.json per agent,
  keeping only the authoring fields (server-managed fields like id/created_at are dropped).

.NOTES
  Requires: 'az login' as an identity that has the data action
  'Microsoft.CognitiveServices/accounts/AIServices/agents/read' on the Foundry resource — the
  built-in role "Azure AI User" grants it. See deploy/agents/README.md.

.EXAMPLE
  ./export-agents.ps1 -ProjectEndpoint https://FabOps-resource.services.ai.azure.com/api/projects/FabOps
#>
param(
  [Parameter(Mandatory)] [string] $ProjectEndpoint,
  [string] $ApiVersion = "2025-11-15-preview",
  [string] $OutDir = "$PSScriptRoot/definitions"
)
$ErrorActionPreference = "Stop"

$token = az account get-access-token --resource "https://ai.azure.com" --query accessToken -o tsv
if (-not $token) { throw "No access token. Run 'az login' (with an identity granted 'Azure AI User' on the Foundry resource)." }
$headers = @{ Authorization = "Bearer $token" }

$root = $ProjectEndpoint.TrimEnd('/')
$listUri = "$root/assistants?api-version=$ApiVersion&limit=100"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$resp = Invoke-RestMethod -Method Get -Uri $listUri -Headers $headers
$count = 0
foreach ($a in $resp.data) {
  $def = [ordered]@{
    name            = $a.name
    model           = $a.model
    description     = $a.description
    instructions    = $a.instructions
    tools           = $a.tools
    tool_resources  = $a.tool_resources
    temperature     = $a.temperature
    top_p           = $a.top_p
    response_format = $a.response_format
    metadata        = $a.metadata
  }
  $safe = ($a.name -replace '[^A-Za-z0-9._-]', '-')
  if ([string]::IsNullOrWhiteSpace($safe)) { $safe = $a.id }
  $path = Join-Path $OutDir "$safe.json"
  ($def | ConvertTo-Json -Depth 40) | Set-Content -Path $path -Encoding utf8
  Write-Host "exported  $($a.name)  ($($a.id))  ->  $path"
  $count++
}
if ($resp.has_more) { Write-Warning "More than 100 agents exist; only the first page was exported. Add pagination if needed." }
Write-Host "Done. $count agent(s) written to $OutDir"
