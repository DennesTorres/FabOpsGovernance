import { useEffect, useMemo, useState } from 'react';
import { HttpAgent } from '@ag-ui/client';
import { CopilotChat, CopilotKitProvider, useRenderTool } from '@copilotkit/react-core/v2';
import { useAuth } from '../auth/AuthProvider';
import { apiUrl } from '../config';
import { RenderPrimitivesRegistrar } from '../components/render/registerRenderPrimitives';
import { FabOpsAssistantMessage, FabOpsUserMessage, ThinkingCursor } from '../components/ChatMessages';
import { SampleQuestions } from '../components/SampleQuestions';

const AGENT_ID = 'default';

/**
 * Fallback renderer for tool calls that have no component of their own — the agent's
 * backend tools (rules manager, rule processor, docs search). Preserves the reference
 * project's "Calling tool: …" activity bubbles.
 */
function ToolActivityRegistrar() {
  useRenderTool({
    name: '*',
    render: ({ name, status }: { name?: string; status?: string }) => (
      <div className="tool-activity">
        <span className={`tool-activity-dot${status === 'complete' ? ' done' : ''}`} />
        <span>{status === 'complete' ? 'Used tool' : 'Calling tool'}: <code>{name}</code></span>
      </div>
    ),
  }, []);
  return null;
}

export default function ChatPage() {
  const { getApiToken } = useAuth();
  const [ready, setReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  // "Clear conversation" starts a fresh AG-UI thread, like the reference UI did.
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [chatError, setChatError] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/config'))
      .then(r => r.json())
      .then((data: { agent_url: string | null }) => {
        if (!data.agent_url) throw new Error('Agent__Url is not configured on the FabOps API.');
        setReady(true);
      })
      .catch((e: Error) => setConfigError(e.message));
  }, []);

  // The browser talks AG-UI straight to the Function App (no runtime tier in between);
  // the user's token rides along for App Service Authentication in Azure.
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: apiUrl('/api/agent'),
        fetch: async (input, init) => {
          const token = await getApiToken();
          const headers = new Headers(init?.headers);
          if (token) headers.set('Authorization', `Bearer ${token}`);
          return window.fetch(input, { ...init, headers });
        },
      }),
    [getApiToken],
  );

  if (configError) {
    return (
      <div className="chat-page">
        <div className="chat-area">
          <div className="messages-container">
            <div className="empty-state">
              <strong>Agent not configured</strong>
              {configError}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <CopilotKitProvider
        selfManagedAgents={{ [AGENT_ID]: agent }}
        showDevConsole={false}
        onError={(e) => setChatError(e?.error?.message ?? 'The agent request failed.')}
      >
        <RenderPrimitivesRegistrar />
        <ToolActivityRegistrar />
        <SampleQuestions agentId={AGENT_ID} />
        <div className="chat-area">
          <div className="env-notice-wrap">
            <span className="env-notice-lead">
              <span className="env-notice-dot" aria-hidden="true" />
              Test environment
              <button
                type="button"
                className="env-notice-btn"
                aria-label="Why this is a test environment"
                aria-expanded={showNotice}
                onClick={() => setShowNotice((o) => !o)}
              >?</button>
            </span>
            {showNotice && (
              <div className="env-notice-pop" role="dialog">
                <button type="button" className="env-notice-pop-close" onClick={() => setShowNotice(false)} aria-label="Close">✕</button>
                This assistant runs against a sample Microsoft Fabric tenant for demonstration
                only. In production, FabOps is set up against your enterprise's own Fabric
                environment for accurate results. Support for additional models is planned.
              </div>
            )}
          </div>
          {chatError && (
            <div className="msg-error" style={{ margin: '8px 0' }}>{chatError}</div>
          )}
          <CopilotChat
            agentId={AGENT_ID}
            threadId={threadId}
            className="fabops-chat dark"
            messageView={{
              assistantMessage: FabOpsAssistantMessage,
              userMessage: FabOpsUserMessage,
              cursor: ThinkingCursor,
            }}
            labels={{
              chatInputPlaceholder: ready
                ? 'Describe a rule or ask about your Fabric governance…'
                : 'Checking agent configuration…',
              welcomeMessageText: '',
              chatDisclaimerText: '',
            }}
          />
          <div className="chat-actions">
            <button className="btn-secondary" onClick={() => setThreadId(crypto.randomUUID())}>
              Clear conversation
            </button>
          </div>
        </div>
      </CopilotKitProvider>
    </div>
  );
}
