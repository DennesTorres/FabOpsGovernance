# UI Rendering Skill — How the Agent Presents Information

Companion to [ui-render-primitives.md](ui-render-primitives.md) (the tool contract). This
document defines *when and how* the agent uses the render tools. The agent and its prompts are
owned by the agent team (this repo contains the UI only) — fold these rules into the agent's
presentation instructions and keep them in sync with this document. Note: the reference
orchestrator prompt tells the agent to present results as markdown tables with ✅/❌ glyphs;
that section must be replaced by these rules for component rendering to be used.

## The principle

The chat surface renders **components, not markdown**. Whenever a reply contains structured
information — a list of rules, a run outcome, a rule's source, a count, a status — the agent
calls a render tool and keeps its accompanying text to a short lead-in sentence. Markdown
tables, bullet dumps of structured data, ``` fences, and emoji status glyphs (✅ ❌ ⚠️) are
never used; the components carry that meaning.

Plain conversational text (clarifying questions, confirmations to proceed, explanations of what
the system can do) stays plain text.

## Choosing a primitive

| You are presenting… | Use |
|---|---|
| Per-object compliance outcomes, rule listings, version histories | `render_table` (failures and errors first; status column uses raw `pass`/`fail`/`error` values) |
| The proportional outcome of a run (pass/fail/error split) | `render_donut` with `centerLabel` like `"3/5"` |
| Counts compared across categories or over time | `render_chart` (`kind: "bar"` for categories, `"line"` for time) |
| A headline: run summary, saved-rule confirmation, one rule's identity | `render_card` (use `items` for id/version/severity facts; `tone` for the overall verdict) |
| One inline status: current/superseded, severity, a single verdict | `render_badge` |
| FRL source or a JSON spec | `render_code` — **raw string, no fences**; `language: "frl"` for rules |

Compose them. A finished compliance run is typically: one `render_card` (rule name + headline
score, `tone` reflecting the overall verdict) → one `render_donut` (the split) → one
`render_table` (per-object detail, failures first, `footnote` for any skipped checks).

A rule shown for confirmation before saving is: `render_code` with the FRL, then a plain-text
question asking whether to save. The FRL the user must see *always* goes through `render_code`
— never inline in the message text.

## Streaming and arguments

- Components render while arguments stream; the user may watch a table fill in. Emit complete,
  valid values per field — never placeholders to "fill in later".
- Send raw values: numbers as numbers, statuses as `pass`/`fail`/`error` strings. The
  components own all styling.
- One tool call per visual. Do not batch two tables into one call or split one table across
  two calls.

## What these tools are not

- **Not input.** Nothing interactive may be drawn with render tools. If the user must decide or
  enter something (e.g. "save this rule?"), ask in plain text — or, when a structured approval
  flow exists, use the Human-in-the-Loop mechanism. Render tools never block the conversation.
- **Not a data channel.** Call them for the user's benefit, not to pass data between agents or
  turns. Sub-agents (`rules_generator_and_manager`, `rule_processor`) return data to the
  orchestrator as text/JSON; only the orchestrator renders.
- **Not mandatory.** A one-sentence answer ("You have 7 current rules.") needs no component —
  though a follow-up that lists them does.
