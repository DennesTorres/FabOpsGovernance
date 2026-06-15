import { useState } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';

/** Starter questions offered to the user. */
const QUESTIONS = [
  "What's the best beaches today?",
  'What hidden secrets would you recommend today?',
  'What accessible beaches are good today?',
];

/**
 * Starter questions, offered two ways:
 *  - Centered over the empty conversation; they disappear once the chat has any messages.
 *  - A side drawer (closed by default, toggled by a button) that stays reachable afterwards.
 * Clicking a question in either place sends it as a user turn and runs the agent.
 */
export function SampleQuestions({ agentId }: { agentId: string }) {
  const { agent } = useAgent({ agentId });
  const [open, setOpen] = useState(false);
  const empty = (agent.messages?.length ?? 0) === 0;

  const ask = (question: string) => {
    if (agent.isRunning) return;
    agent.addMessage({ id: crypto.randomUUID(), role: 'user' as const, content: question });
    void agent.runAgent();
    setOpen(false);
  };

  return (
    <>
      {empty && (
        <div className="starter">
          <div className="starter-inner">
            <div className="starter-title">Try a sample question</div>
            <div className="starter-grid">
              {QUESTIONS.map((q) => (
                <button key={q} type="button" className="starter-card" onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="examples-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Sample questions
      </button>

      <aside className={`examples-drawer${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="examples-drawer-hdr">
          <span>Sample questions</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close sample questions">✕</button>
        </div>
        <ul className="examples-list">
          {QUESTIONS.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => ask(q)}>{q}</button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
