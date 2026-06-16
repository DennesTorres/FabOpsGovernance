using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Azure.Identity;
using FabOps.Api;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Foundry;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient();
builder.Services.AddAGUI();

builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection(AgentOptions.SectionName));
builder.Services.Configure<EntraOptions>(builder.Configuration.GetSection(EntraOptions.SectionName));

// Validates the signed-in user's Entra bearer token (public signing keys, no secret).
builder.Services.AddSingleton<EntraTokenValidator>();

// The SPA is served from a different origin (Static Web Apps) than this API.
const string SpaCors = "spa";
builder.Services.AddCors(o => o.AddPolicy(SpaCors, p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors(SpaCors);

AgentOptions agentOptions = app.Services.GetRequiredService<IOptions<AgentOptions>>().Value;
EntraOptions entraOptions = app.Services.GetRequiredService<IOptions<EntraOptions>>().Value;

// Gate /api/agent on a valid signed-in user token — the same check the old relay did, now as
// middleware in front of the AG-UI endpoint.
app.Use(async (ctx, next) =>
{
    if (entraOptions.RequireAuthentication && ctx.Request.Path.StartsWithSegments("/api/agent"))
    {
        var validator = ctx.RequestServices.GetRequiredService<EntraTokenValidator>();
        if (!await validator.IsValidAsync(ctx.Request.Headers.Authorization.ToString(), ctx.RequestAborted))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await ctx.Response.WriteAsync("Sign in required.");
            return;
        }
    }

    await next(ctx);
});

// ── POST /api/agent ──────────────────────────────────────────────────────────────────────────
// Agent Framework bridges CopilotKit (AG-UI) ⇄ the Foundry agent natively — MapAGUI converts
// between Agent Framework events and the AG-UI protocol, so there is no hand-rolled translation.
// The agent is the EXISTING versioned prompt agent; its tools (the render_* functions) and
// instructions live in its Foundry definition. The Function App's managed identity authenticates
// to the project (no secret).
if (!string.IsNullOrWhiteSpace(agentOptions.ProjectEndpoint) && !string.IsNullOrWhiteSpace(agentOptions.AgentName))
{
    var project = new AIProjectClient(new Uri(agentOptions.ProjectEndpoint), new DefaultAzureCredential());
    ProjectsAgentRecord record = await project.AgentAdministrationClient.GetAgentAsync(agentOptions.AgentName);
    AIAgent agent = project.AsAIAgent(record);

    app.MapAGUI("/api/agent", agent);
}

// ── GET /api/config & /api/secrets — SPA readiness + sign-in config (unchanged contract) ──────
app.MapGet("/api/config", (IOptions<AgentOptions> o) =>
{
    // The configured project endpoint doubles as the readiness signal: null => "agent not configured".
    string? endpoint = o.Value.ProjectEndpoint;
    return Results.Json(new { agent_url = string.IsNullOrWhiteSpace(endpoint) ? null : endpoint });
});

app.MapGet("/api/secrets", (IOptions<EntraOptions> o) =>
{
    EntraOptions e = o.Value;
    return Results.Json(new
    {
        tenant_id = string.IsNullOrWhiteSpace(e.TenantId) ? null : e.TenantId,
        client_id = string.IsNullOrWhiteSpace(e.ClientId) ? null : e.ClientId,
        client_secret_set = !string.IsNullOrWhiteSpace(e.ClientSecret),
    });
});

app.Run();
