import { useState } from 'react';
import { useAgent, useConfigureSuggestions } from '@copilotkit/react-core/v2';

/** Sample questions offered to the user — shown in the middle when the chat is empty, and always
 *  reachable from the side drawer. */
const QUESTIONS = [
  'How many rules are there?',
  'Could you list the rules?',
  'How many executions are there?',
];

/**
 * Two ways to reach the same starter questions:
 *  - Middle of the chat: native CopilotKit static suggestions, which render on the empty/welcome
 *    screen and disappear automatically once the conversation starts.
 *  - A side drawer (closed by default, toggled by a button) so the questions stay reachable after
 *    the chat has started.
 * Clicking a question in either place sends it as a user turn and runs the agent.
 */
export function SampleQuestions({ agentId }: { agentId: string }) {
  const { agent } = useAgent({ agentId });
  const [open, setOpen] = useState(false);

  // Middle suggestions — static config shows them only while messageCount === 0.
  useConfigureSuggestions(
    { suggestions: QUESTIONS.map((q) => ({ title: q, message: q })) },
    [],
  );

  const ask = (question: string) => {
    if (agent.isRunning) return;
    agent.addMessage({ id: crypto.randomUUID(), role: 'user' as const, content: question });
    void agent.runAgent();
    setOpen(false);
  };

  return (
    <>
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
