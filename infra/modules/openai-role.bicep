// Grants 'Cognitive Services OpenAI User' on an existing Azure OpenAI account to a principal.
// Deployed as a module so the assignment can target an AOAI account in another resource group.
targetScope = 'resourceGroup'

@description('Name of the existing Azure OpenAI (Cognitive Services) account in this resource group.')
param openAiAccountName string

@description('Object id of the identity to grant the role to.')
param principalId string

var roleCognitiveServicesOpenAiUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')

resource aoai 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: openAiAccountName
}

resource role 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: aoai
  name: guid(aoai.id, principalId, roleCognitiveServicesOpenAiUser)
  properties: {
    roleDefinitionId: roleCognitiveServicesOpenAiUser
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
