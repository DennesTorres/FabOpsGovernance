using Azure.Core;
using Azure.Identity;
using FabOps.Api;
using FabOps.Api.Functions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection(AgentOptions.SectionName));
builder.Services.Configure<EntraOptions>(builder.Configuration.GetSection(EntraOptions.SectionName));

// The function's managed identity authenticates to the Foundry agent — no secret, no token
// code beyond handing this credential to the request. In Azure this resolves to the Function
// App's system-assigned identity; locally it falls back to the developer's az/VS login.
builder.Services.AddSingleton<TokenCredential>(_ => new DefaultAzureCredential());

// Validates the user's Entra bearer token at the function (public signing keys, no secret).
builder.Services.AddSingleton<EntraTokenValidator>();

// Agent runs stream for minutes; rely on request cancellation, not a client timeout.
builder.Services.AddHttpClient(AgentFunction.HttpClientName, client => client.Timeout = Timeout.InfiniteTimeSpan);

builder.Build().Run();
