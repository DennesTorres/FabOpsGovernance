namespace FabOps.Api;

/// <summary>
/// The downstream agent this API fronts — an Azure AI Foundry agent exposed over the OpenAI
/// Responses protocol. This API translates between AG-UI (what CopilotKit speaks) and the
/// Responses API, and authenticates with the Function App's managed identity (no secret).
/// </summary>
public sealed class AgentOptions
{
    public const string SectionName = "Agent";

    /// <summary>
    /// The Foundry <b>project</b> endpoint that hosts the agent. Unset = the UI shows
    /// "agent not configured". Example:
    /// <c>https://&lt;resource&gt;.services.ai.azure.com/api/projects/&lt;project&gt;</c>.
    /// </summary>
    public string? ProjectEndpoint { get; set; }

    /// <summary>
    /// The Foundry agent to wrap (its latest version is used automatically), e.g.
    /// <c>fabopsorchestrator</c>. Its tools and instructions are owned by the Foundry definition.
    /// </summary>
    public string? AgentName { get; set; }
}

/// <summary>
/// The Entra app registration served to the SPA for MSAL sign-in (identifiers only; the
/// secret never leaves the server). Mirrors the reference project's <c>/api/secrets</c> contract.
/// </summary>
public sealed class EntraOptions
{
    public const string SectionName = "Entra";

    public string? TenantId { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }

    /// <summary>
    /// When true, the agent endpoint only serves requests whose bearer token was validated by
    /// the platform (App Service Authentication / EasyAuth). Enable in Azure; leave false for
    /// local development, where no platform auth runs.
    /// </summary>
    public bool RequireAuthentication { get; set; }
}
