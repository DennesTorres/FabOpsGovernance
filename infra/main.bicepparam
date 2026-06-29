using './main.bicep'

// Suggested defaults — override per environment. Empty strings are "fill me in".
param location = 'uksouth'
param namePrefix = 'fabops'
param cosmosAccountName = 'cosmos-fabops-gov'
param cosmosDatabaseName = 'fabops-governance'
param vectorDimensions = 1536
param embeddingDeployment = 'text-embedding-3-large'

// Azure OpenAI used by the Cosmos MCP for embeddings (leave empty to grant the role manually).
//   e.g. /subscriptions/<sub>/resourceGroups/rg-foundrymsdn/providers/Microsoft.CognitiveServices/accounts/msdnfoundry
param openAiResourceId = ''
param openAiEndpoint = '' // e.g. https://msdnfoundry.cognitiveservices.azure.com/

// UI sign-in + agent wiring (set agentUrl once the orchestrator agent exists — see deploy/agents/).
param agentUrl = ''
param agentTokenScope = 'https://ai.azure.com/.default'
param entraTenantId = ''
param entraClientId = ''
param requireAuthentication = true
