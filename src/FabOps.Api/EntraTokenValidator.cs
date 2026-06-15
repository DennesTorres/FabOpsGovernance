using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace FabOps.Api;

/// <summary>
/// Validates the Entra bearer token the SPA sends, using Microsoft's published signing keys
/// (fetched and cached from the OIDC metadata endpoint) — no client secret. Matches the app
/// registration's multi-tenant + personal-account audience: a token is accepted when its
/// audience is this app's client id and its issuer is any well-formed Microsoft tenant issuer.
/// </summary>
public sealed class EntraTokenValidator
{
    private readonly EntraOptions _options;
    private readonly ConfigurationManager<OpenIdConnectConfiguration>? _configManager;
    private readonly JsonWebTokenHandler _handler = new();

    // v2.0 (login.microsoftonline.com/{tenant}/v2.0) and v1.0 (sts.windows.net/{tenant}/) issuer
    // templates, accepted for ANY tenant GUID — including the 9188040d… "personal accounts" tenant.
    private static readonly Regex MicrosoftIssuer = new(
        @"^https://(login\.microsoftonline\.com/[0-9a-fA-F-]{36}/v2\.0|sts\.windows\.net/[0-9a-fA-F-]{36}/)$",
        RegexOptions.Compiled);

    public EntraTokenValidator(IOptions<EntraOptions> options)
    {
        _options = options.Value;
        if (!string.IsNullOrWhiteSpace(_options.ClientId))
        {
            // "common" metadata serves the signing keys for every tenant and for personal
            // accounts, so tokens from any of them verify; the issuer is checked per-token below.
            _configManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
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
                // Accept any Microsoft tenant issuer (multi-tenant + personal accounts); the real
                // gate is the audience below — the token must be issued for THIS app's client id.
                IssuerValidator = (issuer, _, _) => MicrosoftIssuer.IsMatch(issuer)
                    ? issuer
                    : throw new SecurityTokenInvalidIssuerException($"Untrusted issuer '{issuer}'."),
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
