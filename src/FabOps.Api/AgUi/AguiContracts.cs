using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;

namespace FabOps.Api.AgUi;

// ── AG-UI request shapes (what CopilotKit / @ag-ui/client POST) ─────────────────

/// <summary>The body of <c>POST /api/agent</c>: one agent run, as AG-UI defines it.</summary>
public sealed class RunAgentInput
{
    [JsonPropertyName("threadId")] public string? ThreadId { get; set; }
    [JsonPropertyName("runId")] public string? RunId { get; set; }
    [JsonPropertyName("messages")] public List<AguiMessage> Messages { get; set; } = [];

    /// <summary>Frontend-registered tools (the render_* components) the model may call.</summary>
    [JsonPropertyName("tools")] public List<AguiTool>? Tools { get; set; }

    /// <summary>
    /// Client-attached context (AG-UI <c>context</c>, produced by CopilotKit's
    /// <c>useAgentContext</c>) — e.g. the UI rendering skill. Forwarded to the agent each run.
    /// </summary>
    [JsonPropertyName("context")] public List<AguiContextItem>? Context { get; set; }
}

/// <summary>One client-attached context entry: a human-readable description plus its value.</summary>
public sealed class AguiContextItem
{
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("value")] public string? Value { get; set; }
}

public sealed class AguiMessage
{
    [JsonPropertyName("id")] public string? Id { get; set; }
    [JsonPropertyName("role")] public string Role { get; set; } = string.Empty;
    [JsonPropertyName("content")] public string? Content { get; set; }

    /// <summary>Present on tool-result messages: the id of the call this answers.</summary>
    [JsonPropertyName("toolCallId")] public string? ToolCallId { get; set; }

    /// <summary>Present on assistant messages that invoked tools.</summary>
    [JsonPropertyName("toolCalls")] public List<AguiToolCall>? ToolCalls { get; set; }
}

public sealed class AguiToolCall
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("function")] public AguiFunctionCall Function { get; set; } = new();
}

public sealed class AguiFunctionCall
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("arguments")] public string Arguments { get; set; } = string.Empty;
}

public sealed class AguiTool
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("parameters")] public JsonElement Parameters { get; set; }
}

// ── AG-UI event writer (the events streamed back to CopilotKit) ─────────────────

/// <summary>
/// Writes AG-UI protocol events to the HTTP response as Server-Sent Events, flushing after
/// each one so CopilotKit sees text and tool calls as the agent produces them. Event names are
/// SCREAMING_SNAKE_CASE and fields camelCase, per the AG-UI spec.
/// </summary>
public sealed class AguiEventWriter(HttpResponse response)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public void PrepareResponse()
    {
        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache,no-store";
        response.Headers["X-Accel-Buffering"] = "no";
    }

    public Task RunStartedAsync(string threadId, string runId, CancellationToken ct) =>
        WriteAsync(new { type = "RUN_STARTED", threadId, runId }, ct);

    public Task RunFinishedAsync(string threadId, string runId, CancellationToken ct) =>
        WriteAsync(new { type = "RUN_FINISHED", threadId, runId }, ct);

    public Task RunErrorAsync(string message, string? code, CancellationToken ct) =>
        WriteAsync(new { type = "RUN_ERROR", message, code }, ct);

    public Task TextStartAsync(string messageId, CancellationToken ct) =>
        WriteAsync(new { type = "TEXT_MESSAGE_START", messageId, role = "assistant" }, ct);

    public Task TextContentAsync(string messageId, string delta, CancellationToken ct) =>
        WriteAsync(new { type = "TEXT_MESSAGE_CONTENT", messageId, delta }, ct);

    public Task TextEndAsync(string messageId, CancellationToken ct) =>
        WriteAsync(new { type = "TEXT_MESSAGE_END", messageId }, ct);

    public Task ToolStartAsync(string toolCallId, string toolCallName, CancellationToken ct) =>
        WriteAsync(new { type = "TOOL_CALL_START", toolCallId, toolCallName }, ct);

    public Task ToolArgsAsync(string toolCallId, string delta, CancellationToken ct) =>
        WriteAsync(new { type = "TOOL_CALL_ARGS", toolCallId, delta }, ct);

    public Task ToolEndAsync(string toolCallId, CancellationToken ct) =>
        WriteAsync(new { type = "TOOL_CALL_END", toolCallId }, ct);

    private async Task WriteAsync(object evt, CancellationToken ct)
    {
        string payload = $"data: {JsonSerializer.Serialize(evt, Json)}\n\n";
        await response.Body.WriteAsync(Encoding.UTF8.GetBytes(payload), ct).ConfigureAwait(false);
        await response.Body.FlushAsync(ct).ConfigureAwait(false);
    }
}
