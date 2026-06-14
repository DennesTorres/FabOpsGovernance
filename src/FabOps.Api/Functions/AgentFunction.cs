using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Core;
using FabOps.Api.Agent;
using FabOps.Api.AgUi;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FabOps.Api.Functions;

/// <summary>
/// <c>POST /api/agent</c> — the AG-UI ⇄ OpenAI-Responses bridge. Accepts the AG-UI run from
/// CopilotKit, calls the Foundry agent's Responses endpoint authenticated with the Function
/// App's managed identity, and streams the agent's events back as AG-UI Server-Sent Events.
/// </summary>
public sealed class AgentFunction(
    IHttpClientFactory httpClientFactory,
    TokenCredential credential,
    EntraTokenValidator tokenValidator,
    IOptions<AgentOptions> agentOptions,
    IOptions<EntraOptions> entraOptions,
    ILogger<AgentFunction> logger)
{
    public const string HttpClientName = "agent";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Function("Agent")]
    public async Task RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "agent")] HttpRequest request)
    {
        HttpResponse response = request.HttpContext.Response;
        CancellationToken ct = request.HttpContext.RequestAborted;

        if (entraOptions.Value.RequireAuthentication &&
            !await tokenValidator.IsValidAsync(request.Headers["Authorization"].ToString(), ct).ConfigureAwait(false))
        {
            response.StatusCode = StatusCodes.Status401Unauthorized;
            await response.WriteAsync("Sign in required.", ct).ConfigureAwait(false);
            return;
        }

        AgentOptions agent = agentOptions.Value;
        if (string.IsNullOrWhiteSpace(agent.Url))
        {
            response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await response.WriteAsJsonAsync(new { detail = "Agent URL not configured" }, ct).ConfigureAwait(false);
            return;
        }

        RunAgentInput? input;
        try
        {
            input = await JsonSerializer.DeserializeAsync<RunAgentInput>(request.Body, Json, ct).ConfigureAwait(false);
        }
        catch (JsonException)
        {
            input = null;
        }

        if (input is null)
        {
            response.StatusCode = StatusCodes.Status400BadRequest;
            await response.WriteAsync("The request body is not a valid AG-UI RunAgentInput.", ct).ConfigureAwait(false);
            return;
        }

        string threadId = string.IsNullOrWhiteSpace(input.ThreadId) ? Guid.NewGuid().ToString("N") : input.ThreadId!;
        string runId = string.IsNullOrWhiteSpace(input.RunId) ? Guid.NewGuid().ToString("N") : input.RunId!;

        var writer = new AguiEventWriter(response);
        writer.PrepareResponse();
        await writer.RunStartedAsync(threadId, runId, ct).ConfigureAwait(false);

        try
        {
            // Managed identity provides the bearer token; no secret is stored and no OAuth flow
            // is hand-written — the credential obtains it from the platform.
            AccessToken token = await credential
                .GetTokenAsync(new TokenRequestContext([agent.TokenScope]), ct)
                .ConfigureAwait(false);

            using var upstreamRequest = new HttpRequestMessage(HttpMethod.Post, agent.Url)
            {
                Content = new StringContent(ResponsesBridge.BuildResponsesRequest(input), Encoding.UTF8, "application/json"),
            };
            upstreamRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
            upstreamRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

            HttpResponseMessage upstream = await httpClientFactory.CreateClient(HttpClientName)
                .SendAsync(upstreamRequest, HttpCompletionOption.ResponseHeadersRead, ct)
                .ConfigureAwait(false);

            using (upstream)
            {
                if (!upstream.IsSuccessStatusCode)
                {
                    string detail = await SafeReadAsync(upstream, ct).ConfigureAwait(false);
                    await writer.RunErrorAsync($"Agent endpoint returned HTTP {(int)upstream.StatusCode}. {detail}", "AgentHttpError", ct).ConfigureAwait(false);
                    return;
                }

                Stream stream = await upstream.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
                await using (stream.ConfigureAwait(false))
                {
                    bool error = await ResponsesBridge.TranslateAsync(stream, writer, ct).ConfigureAwait(false);
                    if (!error)
                    {
                        await writer.RunFinishedAsync(threadId, runId, ct).ConfigureAwait(false);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Client disconnected; nothing to write.
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Agent run {RunId} failed.", runId);
            try
            {
                await writer.RunErrorAsync(ex.Message, "BridgeError", ct).ConfigureAwait(false);
            }
            catch
            {
                // The connection is gone; let it close.
            }
        }
    }

    private static async Task<string> SafeReadAsync(HttpResponseMessage upstream, CancellationToken ct)
    {
        try
        {
            string text = await upstream.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            return text.Length > 500 ? text[..500] : text;
        }
        catch
        {
            return string.Empty;
        }
    }
}
