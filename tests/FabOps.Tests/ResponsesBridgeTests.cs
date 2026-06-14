using System.Text;
using System.Text.Json;
using FabOps.Api.Agent;
using FabOps.Api.AgUi;
using Microsoft.AspNetCore.Http;

namespace FabOps.Tests;

public class ResponsesBridgeTests
{
    [Fact]
    public void BuildRequest_SendsOnlyConversationText_NoToolsNoModel()
    {
        // A Foundry agent rejects a `tools` param ("Not allowed when agent is specified"), so the
        // request must carry only the conversation — never the frontend render_* tools.
        var input = new RunAgentInput
        {
            ThreadId = "t1",
            RunId = "r1",
            Messages =
            [
                new AguiMessage { Role = "system", Content = "be terse" },
                new AguiMessage { Role = "user", Content = "list my rules" },
            ],
            Tools =
            [
                new AguiTool { Name = "render_table", Description = "Tabular data.", Parameters = default },
            ],
        };

        using var doc = JsonDocument.Parse(ResponsesBridge.BuildResponsesRequest(input));
        JsonElement root = doc.RootElement;

        Assert.True(root.GetProperty("stream").GetBoolean());
        Assert.False(root.TryGetProperty("model", out _)); // agent binds its own model
        Assert.False(root.TryGetProperty("tools", out _)); // tools are NOT forwarded to the agent

        JsonElement items = root.GetProperty("input");
        Assert.Single(items.EnumerateArray());                  // system message dropped — the agent owns its prompt
        Assert.Equal("user", items[0].GetProperty("role").GetString());
        Assert.Equal("list my rules", items[0].GetProperty("content").GetString());
    }

    [Fact]
    public void BuildRequest_DropsClientContext_AgentRejectsAllInjection()
    {
        // Verified live: this agent rejects tools, instructions, AND system/developer messages with
        // HTTP 400 "Not allowed when agent is specified". So client context (useAgentContext)
        // cannot reach it — the relay drops it and forwards only the conversation.
        var input = new RunAgentInput
        {
            Messages = [new AguiMessage { Role = "user", Content = "list my rules" }],
            Context =
            [
                new AguiContextItem { Description = "UI rendering skill", Value = "Render components, not markdown." },
            ],
        };

        using var doc = JsonDocument.Parse(ResponsesBridge.BuildResponsesRequest(input));
        JsonElement root = doc.RootElement;

        Assert.False(root.TryGetProperty("instructions", out _));    // not forwarded — agent rejects it
        JsonElement items = root.GetProperty("input");
        Assert.Single(items.EnumerateArray());
        Assert.Equal("list my rules", items[0].GetProperty("content").GetString()); // skill not merged into the message
    }

    [Fact]
    public void BuildRequest_SkipsToolMessagesAndToolCallOnlyTurns()
    {
        var input = new RunAgentInput
        {
            Messages =
            [
                new AguiMessage { Role = "user", Content = "show a card" },
                new AguiMessage { Role = "assistant", Content = "", ToolCalls = [new AguiToolCall { Id = "call_x", Function = new AguiFunctionCall { Name = "render_card", Arguments = "{}" } }] },
                new AguiMessage { Role = "tool", ToolCallId = "call_x", Content = "{\"rendered\":true}" },
                new AguiMessage { Role = "user", Content = "now how many rules are there?" },
            ],
        };

        string json = ResponsesBridge.BuildResponsesRequest(input);
        using var doc = JsonDocument.Parse(json);
        JsonElement items = doc.RootElement.GetProperty("input");

        Assert.Equal(2, items.GetArrayLength()); // only the two user messages survive
        Assert.All(items.EnumerateArray(), i => Assert.Equal("user", i.GetProperty("role").GetString()));
        Assert.DoesNotContain("function_call", json); // no tool items leak to the agent
    }

    [Fact]
    public async Task Translate_TextDeltas_EmitBracketedAguiTextEvents()
    {
        string sse =
            "event: response.output_text.delta\n" +
            "data: {\"type\":\"response.output_text.delta\",\"item_id\":\"msg_1\",\"delta\":\"Hello\"}\n\n" +
            "data: {\"type\":\"response.output_text.delta\",\"item_id\":\"msg_1\",\"delta\":\" world\"}\n\n" +
            "data: {\"type\":\"response.completed\"}\n\n";

        string outSse = await RunTranslateAsync(sse);

        Assert.Contains("\"type\":\"TEXT_MESSAGE_START\"", outSse);
        Assert.Contains("\"messageId\":\"msg_1\"", outSse);
        Assert.Contains("\"delta\":\"Hello\"", outSse);
        Assert.Contains("\"delta\":\" world\"", outSse);
        Assert.Contains("\"type\":\"TEXT_MESSAGE_END\"", outSse);
        Assert.DoesNotContain("RUN_ERROR", outSse);
    }

    [Fact]
    public async Task Translate_FunctionCall_EmitsToolCallEvents_WithCallId()
    {
        string sse =
            "data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"function_call\",\"id\":\"fc_1\",\"call_id\":\"call_1\",\"name\":\"render_table\"}}\n\n" +
            "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"delta\":\"{\\\"title\\\":\\\"Rules\\\"}\"}\n\n" +
            "data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"function_call\",\"id\":\"fc_1\",\"call_id\":\"call_1\",\"name\":\"render_table\"}}\n\n" +
            "data: {\"type\":\"response.completed\"}\n\n";

        string outSse = await RunTranslateAsync(sse);

        Assert.Contains("\"type\":\"TOOL_CALL_START\"", outSse);
        Assert.Contains("\"toolCallId\":\"call_1\"", outSse);
        Assert.Contains("\"toolCallName\":\"render_table\"", outSse);
        Assert.Contains("\"type\":\"TOOL_CALL_ARGS\"", outSse);
        Assert.Contains("\"type\":\"TOOL_CALL_END\"", outSse);
    }

    [Fact]
    public async Task Translate_ErrorEvent_EmitsRunError()
    {
        string sse = "data: {\"type\":\"error\",\"error\":{\"message\":\"quota exceeded\"}}\n\n";

        string outSse = await RunTranslateAsync(sse);

        Assert.Contains("\"type\":\"RUN_ERROR\"", outSse);
        Assert.Contains("quota exceeded", outSse);
    }

    private static async Task<string> RunTranslateAsync(string upstreamSse)
    {
        var context = new DefaultHttpContext();
        var body = new MemoryStream();
        context.Response.Body = body;

        var writer = new AguiEventWriter(context.Response);
        writer.PrepareResponse();

        using var upstream = new MemoryStream(Encoding.UTF8.GetBytes(upstreamSse));
        await ResponsesBridge.TranslateAsync(upstream, writer, CancellationToken.None);

        return Encoding.UTF8.GetString(body.ToArray());
    }
}
