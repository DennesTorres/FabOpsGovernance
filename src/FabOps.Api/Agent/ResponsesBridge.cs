using System.Text;
using System.Text.Json;
using FabOps.Api.AgUi;

namespace FabOps.Api.Agent;

/// <summary>
/// Translates between AG-UI (what CopilotKit speaks) and the Azure AI Foundry agent's
/// OpenAI-Responses protocol:
/// <list type="bullet">
/// <item><see cref="BuildResponsesRequest"/> turns an AG-UI <see cref="RunAgentInput"/> into a
/// Responses request body (no <c>model</c> — the agent binds its own).</item>
/// <item><see cref="TranslateAsync"/> reads the Responses streaming events and emits the
/// matching AG-UI events.</item>
/// </list>
/// Targets the standard OpenAI Responses streaming contract; the event-name mapping is the one
/// piece that should be confirmed against a live run once the managed identity has access.
/// </summary>
public static class ResponsesBridge
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string BuildResponsesRequest(RunAgentInput input)
    {
        // The agent is a Foundry prompt agent reached over OpenAI-Responses. It owns its tools AND
        // its base prompt server-side and rejects `tools`, `instructions`, and any system/developer
        // message item — all with HTTP 400 "Not allowed when agent is specified" (verified live).
        // So the relay can forward ONLY the user/assistant conversation; client-attached context
        // and tools cannot be pushed into this agent from here — that is an agent-side concern.
        var items = new List<object>();
        foreach (AguiMessage m in input.Messages)
        {
            string role =
                string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase) ? "user" :
                string.Equals(m.Role, "assistant", StringComparison.OrdinalIgnoreCase) ? "assistant" :
                string.Empty;

            if (role.Length == 0 || string.IsNullOrEmpty(m.Content))
            {
                continue; // skip system/developer, tool, and content-less (tool-call-only) turns
            }

            items.Add(new { role, content = m.Content });
        }

        return JsonSerializer.Serialize(new { input = items, stream = true }, Json);
    }

    /// <summary>Reads the Responses SSE stream, writes AG-UI events. Returns true if a RUN_ERROR was emitted.</summary>
    public static async Task<bool> TranslateAsync(Stream upstream, AguiEventWriter writer, CancellationToken ct)
    {
        using var reader = new StreamReader(upstream, Encoding.UTF8);
        var data = new StringBuilder();
        string? currentText = null;
        var callIdByItem = new Dictionary<string, string>(StringComparer.Ordinal);
        bool error = false;

        string? line;
        while ((line = await reader.ReadLineAsync(ct).ConfigureAwait(false)) is not null)
        {
            if (line.Length == 0)
            {
                if (data.Length > 0)
                {
                    bool terminal = await HandleAsync(data.ToString()).ConfigureAwait(false);
                    data.Clear();
                    if (terminal)
                    {
                        break;
                    }
                }

                continue;
            }

            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                data.Append(line.AsSpan(5).Trim());
            }
            // "event:" lines and ":" comments are ignored — the type is read from the data JSON.
        }

        if (data.Length > 0 && !error)
        {
            await HandleAsync(data.ToString()).ConfigureAwait(false);
        }

        if (currentText is not null)
        {
            await writer.TextEndAsync(currentText, ct).ConfigureAwait(false);
        }

        return error;

        // Local function; returns true when a terminal event (completed/failed/error) was seen.
        async Task<bool> HandleAsync(string payload)
        {
            if (payload is "[DONE]")
            {
                return false;
            }

            JsonDocument doc;
            try { doc = JsonDocument.Parse(payload); }
            catch (JsonException) { return false; }

            using (doc)
            {
                JsonElement root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                {
                    return false;
                }

                switch (GetString(root, "type"))
                {
                    case "response.output_item.added":
                        if (root.TryGetProperty("item", out JsonElement added) && added.ValueKind == JsonValueKind.Object &&
                            string.Equals(GetString(added, "type"), "function_call", StringComparison.Ordinal))
                        {
                            string itemId = GetString(added, "id") ?? string.Empty;
                            string callId = GetString(added, "call_id") ?? itemId;
                            if (itemId.Length > 0)
                            {
                                callIdByItem[itemId] = callId;
                            }

                            await writer.ToolStartAsync(callId, GetString(added, "name") ?? "tool", ct).ConfigureAwait(false);
                        }

                        return false;

                    case "response.output_text.delta":
                    {
                        string itemId = GetString(root, "item_id") ?? currentText ?? "message";
                        if (!string.Equals(currentText, itemId, StringComparison.Ordinal))
                        {
                            if (currentText is not null)
                            {
                                await writer.TextEndAsync(currentText, ct).ConfigureAwait(false);
                            }

                            await writer.TextStartAsync(itemId, ct).ConfigureAwait(false);
                            currentText = itemId;
                        }

                        string delta = GetString(root, "delta") ?? string.Empty;
                        if (delta.Length > 0)
                        {
                            await writer.TextContentAsync(itemId, delta, ct).ConfigureAwait(false);
                        }

                        return false;
                    }

                    case "response.output_text.done":
                        if (currentText is not null &&
                            string.Equals(currentText, GetString(root, "item_id") ?? currentText, StringComparison.Ordinal))
                        {
                            await writer.TextEndAsync(currentText, ct).ConfigureAwait(false);
                            currentText = null;
                        }

                        return false;

                    case "response.function_call_arguments.delta":
                    {
                        string itemId = GetString(root, "item_id") ?? string.Empty;
                        string callId = callIdByItem.TryGetValue(itemId, out string? c) ? c : itemId;
                        string delta = GetString(root, "delta") ?? string.Empty;
                        if (delta.Length > 0)
                        {
                            await writer.ToolArgsAsync(callId, delta, ct).ConfigureAwait(false);
                        }

                        return false;
                    }

                    case "response.output_item.done":
                        if (root.TryGetProperty("item", out JsonElement done) && done.ValueKind == JsonValueKind.Object)
                        {
                            string itemType = GetString(done, "type") ?? string.Empty;
                            string itemId = GetString(done, "id") ?? string.Empty;
                            if (itemType == "function_call")
                            {
                                string callId = GetString(done, "call_id") ?? (callIdByItem.TryGetValue(itemId, out string? c) ? c : itemId);
                                await writer.ToolEndAsync(callId, ct).ConfigureAwait(false);
                            }
                            else if (itemType == "message" && currentText is not null &&
                                     string.Equals(currentText, itemId, StringComparison.Ordinal))
                            {
                                await writer.TextEndAsync(currentText, ct).ConfigureAwait(false);
                                currentText = null;
                            }
                        }

                        return false;

                    case "response.completed":
                        return true;

                    case "response.failed":
                    case "error":
                        await writer.RunErrorAsync(ExtractError(root), "AgentError", ct).ConfigureAwait(false);
                        error = true;
                        return true;

                    default:
                        return false;
                }
            }
        }
    }

    private static string ExtractError(JsonElement root)
    {
        const string fallback = "The agent reported an error.";
        if (root.TryGetProperty("error", out JsonElement err) && err.ValueKind == JsonValueKind.Object)
        {
            return GetString(err, "message") ?? fallback;
        }

        if (root.TryGetProperty("response", out JsonElement resp) && resp.ValueKind == JsonValueKind.Object &&
            resp.TryGetProperty("error", out JsonElement respErr) && respErr.ValueKind == JsonValueKind.Object)
        {
            return GetString(respErr, "message") ?? fallback;
        }

        return GetString(root, "message") ?? fallback;
    }

    private static string? GetString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object &&
        element.TryGetProperty(property, out JsonElement value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
