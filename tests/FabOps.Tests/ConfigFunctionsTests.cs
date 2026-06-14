using System.Text.Json;
using FabOps.Api;
using FabOps.Api.Functions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace FabOps.Tests;

public class ConfigFunctionsTests
{
    private static ConfigFunctions Create(AgentOptions? agent = null, EntraOptions? entra = null) =>
        new(Options.Create(agent ?? new AgentOptions()), Options.Create(entra ?? new EntraOptions()));

    private static JsonElement Payload(IActionResult result)
    {
        var ok = Assert.IsType<OkObjectResult>(result);
        return JsonSerializer.SerializeToElement(ok.Value);
    }

    [Fact]
    public void Config_ReturnsNullAgentUrl_WhenUnconfigured()
    {
        var payload = Payload(Create().GetConfig(new DefaultHttpContext().Request));

        Assert.Equal(JsonValueKind.Null, payload.GetProperty("agent_url").ValueKind);
    }

    [Fact]
    public void Config_ReturnsConfiguredAgentUrl()
    {
        var sut = Create(new AgentOptions { Url = "https://agents.example.com/fabops" });

        var payload = Payload(sut.GetConfig(new DefaultHttpContext().Request));

        Assert.Equal("https://agents.example.com/fabops", payload.GetProperty("agent_url").GetString());
    }

    [Fact]
    public void Secrets_MirrorsReferenceContract()
    {
        var sut = Create(entra: new EntraOptions { TenantId = "tenant-1", ClientId = "client-1", ClientSecret = "s3cret" });

        var payload = Payload(sut.GetSecrets(new DefaultHttpContext().Request));

        Assert.Equal("tenant-1", payload.GetProperty("tenant_id").GetString());
        Assert.Equal("client-1", payload.GetProperty("client_id").GetString());
        Assert.True(payload.GetProperty("client_secret_set").GetBoolean());
    }

    [Fact]
    public void Secrets_ReportsUnsetValues_AsNulls_AndSecretFlagFalse()
    {
        var payload = Payload(Create().GetSecrets(new DefaultHttpContext().Request));

        Assert.Equal(JsonValueKind.Null, payload.GetProperty("tenant_id").ValueKind);
        Assert.Equal(JsonValueKind.Null, payload.GetProperty("client_id").ValueKind);
        Assert.False(payload.GetProperty("client_secret_set").GetBoolean());
    }
}
