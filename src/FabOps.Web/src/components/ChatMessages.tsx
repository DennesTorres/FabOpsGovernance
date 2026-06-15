import {
  CopilotChatAssistantMessage,
  CopilotChatUserMessage,
  type CopilotChatAssistantMessageProps,
  type CopilotChatUserMessageProps,
} from '@copilotkit/react-core/v2';
import AgentAvatar from './AgentAvatar';
import UserAvatar from './UserAvatar';

/**
 * Per-turn message rows. Every assistant turn carries the agent's avatar + name (the look that
 * used to be a one-off header); user turns get the same layout with a distinct avatar and label.
 * Each wraps the default CopilotKit message component, so markdown, tool-call rendering, copy
 * buttons, etc. are all preserved — we only add the identity row around it.
 *
 * `Object.assign(fn, Default)` copies the default's static slot members (MarkdownRenderer,
 * Toolbar, …) onto our wrapper so it satisfies `SlotValue<typeof CopilotChat*Message>`.
 */

export const FabOpsAssistantMessage = Object.assign(
  (props: CopilotChatAssistantMessageProps) => (
    <div className="msg-row msg-row-agent">
      <span className="msg-avatar"><AgentAvatar size={34} /></span>
      <div className="msg-col">
        <span className="msg-author">FabOps Copilot</span>
        <CopilotChatAssistantMessage {...props} />
      </div>
    </div>
  ),
  CopilotChatAssistantMessage,
);

export const FabOpsUserMessage = Object.assign(
  (props: CopilotChatUserMessageProps) => (
    <div className="msg-row msg-row-user">
      <span className="msg-avatar"><UserAvatar size={34} /></span>
      <div className="msg-col">
        <span className="msg-author">You</span>
        <CopilotChatUserMessage {...props} />
      </div>
    </div>
  ),
  CopilotChatUserMessage,
);
