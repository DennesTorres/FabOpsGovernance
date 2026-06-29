// FabOps Governance — infrastructure for THIS repository's deployables.
//
// Provisions, in the target resource group:
//   - Azure Cosmos DB (serverless + NoSQL vector search) + database + the 3 governance containers
//   - Storage, Log Analytics + Application Insights
//   - FabOps.CosmosMcp  -> Flex Consumption Function App (.NET 8 isolated), keyless to Cosmos + AOAI
//   - FabOps.Api (UI/bridge) -> Flex Consumption Function App (.NET 8 isolated)
//   - FabOps.Web -> Static Web App
//   - Keyless role assignments (managed identity, no keys/connection strings)
//
// OUT OF SCOPE (handled elsewhere — see docs/DEPLOYMENT.md and deploy/agents/):
//   - The Azure AI Foundry account/project, the GPT-4.1 deployment, and the four agents.
//     Those live in a separate subscription and agents are data-plane objects, not ARM resources.
//
// Validate before applying:  az deployment group what-if -g <rg> -f infra/main.bicep -p infra/main.bicepparam

targetScope = 'resourceGroup'

@description('Region for all resources. Default matches the existing Cosmos account region.')
param location string = 'uksouth'

@description('Lowercase name stem used to derive resource names.')
@minLength(3)
@maxLength(12)
param namePrefix string = 'fabops'

@description('Cosmos DB account name (globally unique).')
param cosmosAccountName string = 'cosmos-${namePrefix}-gov'

@description('Cosmos SQL database name.')
param cosmosDatabaseName string = 'fabops-governance'

@description('Embedding dimensions for the governance-rules vector index (must match the embedding model deployment).')
param vectorDimensions int = 1536

@description('Resource id of the Azure OpenAI account the Cosmos MCP uses for embeddings. Empty = skip the OpenAI role assignment (grant it manually).')
param openAiResourceId string = ''

@description('Embedding deployment name on the Azure OpenAI resource.')
param embeddingDeployment string = 'text-embedding-3-large'

@description('Azure OpenAI endpoint the Cosmos MCP uses for embeddings.')
param openAiEndpoint string = ''

@description('Orchestrator agent Responses endpoint for the UI API Agent__Url. Empty = configure later.')
param agentUrl string = ''

@description('Entra scope the UI API managed identity requests to call the agent.')
param agentTokenScope string = 'https://ai.azure.com/.default'

@description('Entra tenant id served to the SPA for sign-in.')
param entraTenantId string = ''

@description('Entra client id (SPA app registration) served to the SPA.')
param entraClientId string = ''

@description('Require a validated Entra bearer token on /api/agent (true in Azure).')
param requireAuthentication bool = true

var tags = { app: 'FabOps', component: 'governance' }
var suffix = take(uniqueString(resourceGroup().id), 6)
var storageName = take(toLower(replace('st${namePrefix}${suffix}', '-', '')), 24)
var lawName = 'law-${namePrefix}'
var appiName = 'appi-${namePrefix}'
var mcpFuncName = 'func-${namePrefix}-cosmosmcp'
var uiFuncName = 'func-${namePrefix}-ui-${suffix}'
var mcpPlanName = 'plan-${namePrefix}-mcp'
var uiPlanName = 'plan-${namePrefix}-ui'
var swaName = 'swa-${namePrefix}-ui'
var mcpDeployContainer = 'mcp-deploy'
var uiDeployContainer = 'ui-deploy'

// Built-in role definition ids (constant across subscriptions).
var roleStorageBlobDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var cosmosDataContributorDefId = '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
// Azure OpenAI account location parsed from its resource id (for the cross-scope role module).
var aoaiSubId = empty(openAiResourceId) ? subscription().subscriptionId : split(openAiResourceId, '/')[2]
var aoaiRg = empty(openAiResourceId) ? resourceGroup().name : split(openAiResourceId, '/')[4]
var aoaiName = empty(openAiResourceId) ? '' : last(split(openAiResourceId, '/'))

// ---------------------------------------------------------------------------
// Cosmos DB (serverless + NoSQL vector search) and the governance containers
// ---------------------------------------------------------------------------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  tags: tags
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [ { locationName: location, failoverPriority: 0, isZoneRedundant: false } ]
    capabilities: [ { name: 'EnableServerless' }, { name: 'EnableNoSQLVectorSearch' } ]
    disableLocalAuth: true // managed identity only — no account keys
    minimalTlsVersion: 'Tls12'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: cosmosDatabaseName
  properties: { resource: { id: cosmosDatabaseName } }
}

resource rulesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: 'governance-rules'
  properties: {
    resource: {
      id: 'governance-rules'
      partitionKey: { paths: [ '/rule_id' ], kind: 'Hash' }
      vectorEmbeddingPolicy: {
        vectorEmbeddings: [
          { path: '/nl_intent_vector', dataType: 'float32', dimensions: vectorDimensions, distanceFunction: 'cosine' }
        ]
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/nl_intent_vector/*' }, { path: '/_etag/?' } ]
        vectorIndexes: [ { path: '/nl_intent_vector', type: 'diskANN' } ]
      }
    }
  }
}

resource executionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: 'governance-executions'
  properties: {
    resource: {
      id: 'governance-executions'
      partitionKey: { paths: [ '/run_id' ], kind: 'Hash' }
    }
  }
}

resource executionItemsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: 'governance-execution-items'
  properties: {
    resource: {
      id: 'governance-execution-items'
      partitionKey: { paths: [ '/run_id' ], kind: 'Hash' }
    }
  }
}

// ---------------------------------------------------------------------------
// Storage + monitoring
// ---------------------------------------------------------------------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  #disable-next-line BCP334
  name: storageName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource mcpDeploy 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: mcpDeployContainer
}

resource uiDeploy 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: uiDeployContainer
}

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: lawName
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: appiName
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: law.id }
}

// ---------------------------------------------------------------------------
// FabOps.CosmosMcp — Flex Consumption Function App
// ---------------------------------------------------------------------------
resource mcpPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: mcpPlanName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

resource mcpFunc 'Microsoft.Web/sites@2023-12-01' = {
  name: mcpFuncName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: mcpPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${mcpDeployContainer}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      runtime: { name: 'dotnet-isolated', version: '8.0' }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 2048 }
    }
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appi.properties.ConnectionString }
        { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
        { name: 'COSMOS_DATABASE', value: cosmosDatabaseName }
        { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
        { name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT', value: embeddingDeployment }
        { name: 'AZURE_OPENAI_EMBEDDING_DIMENSIONS', value: string(vectorDimensions) }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// FabOps.Api — UI/bridge — Flex Consumption Function App
// ---------------------------------------------------------------------------
resource uiPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: uiPlanName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

resource uiFunc 'Microsoft.Web/sites@2023-12-01' = {
  name: uiFuncName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: uiPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${uiDeployContainer}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      runtime: { name: 'dotnet-isolated', version: '8.0' }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 2048 }
    }
    siteConfig: {
      cors: { allowedOrigins: [ 'https://${swa.properties.defaultHostname}', 'http://localhost:5173' ] }
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appi.properties.ConnectionString }
        { name: 'Agent__Url', value: agentUrl }
        { name: 'Agent__TokenScope', value: agentTokenScope }
        { name: 'Entra__TenantId', value: entraTenantId }
        { name: 'Entra__ClientId', value: entraClientId }
        { name: 'Entra__RequireAuthentication', value: string(requireAuthentication) }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// FabOps.Web — Static Web App
// ---------------------------------------------------------------------------
resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  tags: tags
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {}
}

// ---------------------------------------------------------------------------
// Role assignments (keyless)
// ---------------------------------------------------------------------------
// Cosmos data-plane: the MCP identity reads and writes documents.
resource mcpCosmosData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, mcpFunc.id, 'cosmos-data-contributor')
  properties: {
    roleDefinitionId: cosmosDataContributorDefId
    principalId: mcpFunc.identity.principalId
    scope: cosmos.id
  }
}

// Both function identities need blob access to their deployment container (keyless storage).
resource mcpStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, mcpFunc.id, roleStorageBlobDataContributor)
  properties: {
    roleDefinitionId: roleStorageBlobDataContributor
    principalId: mcpFunc.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource uiStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, uiFunc.id, roleStorageBlobDataContributor)
  properties: {
    roleDefinitionId: roleStorageBlobDataContributor
    principalId: uiFunc.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Azure OpenAI (embeddings) for the MCP identity — a module because the AOAI account may live in
// a different resource group/subscription. Skipped when openAiResourceId is empty.
module mcpOpenAiRole 'modules/openai-role.bicep' = if (!empty(openAiResourceId)) {
  name: 'mcp-openai-role'
  scope: resourceGroup(aoaiSubId, aoaiRg)
  params: {
    openAiAccountName: aoaiName
    principalId: mcpFunc.identity.principalId
  }
}

// ---------------------------------------------------------------------------
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output mcpFunctionName string = mcpFunc.name
output mcpFunctionHostname string = mcpFunc.properties.defaultHostName
output uiFunctionName string = uiFunc.name
output uiFunctionHostname string = uiFunc.properties.defaultHostName
output uiFunctionPrincipalId string = uiFunc.identity.principalId
output staticWebAppName string = swa.name
output staticWebAppHostname string = swa.properties.defaultHostname
