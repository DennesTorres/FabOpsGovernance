using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Options;

namespace FabOps.Api.Functions;

/// <summary>
/// Readiness and sign-in configuration for the SPA — the same two GET endpoints, with the
/// same response shapes, as the reference project's backend. The credential WRITE path of the
/// reference UI was dead code (its backend never implemented it) and is intentionally absent
/// (docs/DECISIONS.md D06).
/// </summary>
public sealed class ConfigFunctions(IOptions<AgentOptions> agentOptions, IOptions<EntraOptions> entraOptions)
{
    [Function("GetConfig")]
    public IActionResult GetConfig(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "config")] HttpRequest request)
    {
        // Mirrors GET /api/config: the configured agent URL doubles as the readiness signal
        // (null means "agent not configured" and the chat page says so).
        string? url = agentOptions.Value.Url;
        return new OkObjectResult(new { agent_url = string.IsNullOrWhiteSpace(url) ? null : url });
    }

    [Function("GetSecrets")]
    public IActionResult GetSecrets(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "secrets")] HttpRequest request)
    {
        EntraOptions options = entraOptions.Value;
        return new OkObjectResult(new
        {
            tenant_id = string.IsNullOrWhiteSpace(options.TenantId) ? null : options.TenantId,
            client_id = string.IsNullOrWhiteSpace(options.ClientId) ? null : options.ClientId,
            client_secret_set = !string.IsNullOrWhiteSpace(options.ClientSecret),
        });
    }
}
