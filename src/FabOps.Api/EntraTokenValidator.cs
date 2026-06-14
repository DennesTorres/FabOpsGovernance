using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace FabOps.Api;

/// <summary>
/// Validates the Entra bearer token the SPA sends, using the tenant's published signing keys
/// (fetched and cached from the OIDC metadata endpoint) — no client secret. Accepts tokens
/// whose audience is the app's client id and whose issuer is the configured tenant.
/// </summary>
public sealed class EntraTokenValidator
{
    private readonly EntraOptions _options;
    private readonly string? _issuer;
    private readonly ConfigurationManager<OpenIdConnectConfiguration>? _configManager;
    private readonly JsonWebTokenHandler _handler = new();

    public EntraTokenValidator(IOptions<EntraOptions> options)
    {
        _options = options.Value;
        if (!string.IsNullOrWhiteSpace(_options.TenantId))
        {
            _issuer = $"https://login.microsoftonline.com/{_options.TenantId}/v2.0";
            _configManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                $"{_issuer}/.well-known/openid-configuration",
                new OpenIdConnectConfigurationRetriever());
        }
    }

    public async Task<bool> IsValidAsync(string? authorizationHeader, CancellationToken cancellationToken)
    {
        if (_configManager is null || string.IsNullOrWhiteSpace(_options.ClientId))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(authorizationHeader) ||
            !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        string token = authorizationHeader["Bearer ".Length..].Trim();
        try
        {
            OpenIdConnectConfiguration config = await _configManager.GetConfigurationAsync(cancellationToken).ConfigureAwait(false);
            TokenValidationResult result = await _handler.ValidateTokenAsync(token, new TokenValidationParameters
            {
                // Accept both the v2.0 issuer (MSAL.js default) and the v1.0 issuer, so whichever
                // token version the SPA obtains validates.
                ValidIssuers = [_issuer!, $"https://sts.windows.net/{_options.TenantId}/"],
                ValidAudiences = [_options.ClientId!, $"api://{_options.ClientId}"],
                IssuerSigningKeys = config.SigningKeys,
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
            }).ConfigureAwait(false);
            return result.IsValid;
        }
        catch
        {
            return false;
        }
    }
}
