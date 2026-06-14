# UI Render Primitives — Tool Contract

The chat surface renders **components, not markdown**. Six display-only primitives are
registered on the frontend as components-as-tools (CopilotKit v2 `useComponent`). The agent
renders rich UI by *calling these tools*; the tool arguments become the component's typed props.
There is no handler anywhere for them: CopilotKit forwards the declarations in
`RunAgentInput.tools` on every run, the FabOps API relays the run to the agent endpoint
untouched, and the agent (e.g. ADK with `AGUIToolset()`) surfaces them to the model and streams
the calls back to the browser.

These definitions are canonical. The tool names, parameter names, and casing below must match
the frontend registration (`FabOps.Web/src/components/render/registerRenderPrimitives.tsx`)
exactly. (The accompanying instructions referenced this file in the reference project; it did
not exist there — this document was authored for this repo as the single source of truth. See
DECISIONS.md D11.1.)

Shared rules — every primitive:

- **Display-only.** No user input is collected. Anything requiring input or confirmation is
  Human-in-the-Loop, not these tools.
- **Raw values.** Send plain strings/numbers — no markdown, no emoji status glyphs, no ` ``` `
  fences.
- **Streaming-tolerant.** Components render while arguments stream in; every field may be
  momentarily `undefined` and arrays may be partially populated. Components must not throw on
  partial props.
- **Optional means omittable.** Fields marked optional can be left out entirely.

---

## render_table

Tabular data — lists of rules, per-object compliance outcomes, version histories.

| Parameter | Type | Req | Notes |
|---|---|---|---|
| `title` | string | no | Short heading above the table |
| `columns` | `{ key, label, align? }[]` | yes | `key` addresses row fields; `align`: `"left" \| "center" \| "right"` (default left) |
| `rows` | `Record<string, string \| number \| boolean \| null>[]` | yes | Keyed by column `key` |
| `footnote` | string | no | Small text under the table (e.g. skipped checks) |

Cell values equal to `pass`, `fail`, `error`, `warning` (case-insensitive) in a column whose
`key` or `label` is `status` are rendered as coloured status pills. List failures and errors
before passes when presenting compliance outcomes.

```json
{
  "title": "Workspace admin-groups rule — run 7f3a",
  "columns": [
    { "key": "object", "label": "Object" },
    { "key": "status", "label": "Status", "align": "center" },
    { "key": "why", "label": "Why" }
  ],
  "rows": [
    { "object": "Sales-Prod", "status": "fail", "why": "Only 1 admin group; rule requires 2" },
    { "object": "Finance-Q4", "status": "pass", "why": "" }
  ]
}
```

## render_donut

Proportional breakdown — pass/fail/error split of a compliance run, rules by severity.

| Parameter | Type | Req | Notes |
|---|---|---|---|
| `title` | string | no | |
| `slices` | `{ label, value, tone? }[]` | yes | `value` ≥ 0; `tone`: `"success" \| "danger" \| "warning" \| "info" \| "neutral"` |
| `centerLabel` | string | no | Text in the donut hole, e.g. `"3/5"` |

```json
{
  "title": "Run outcome",
  "slices": [
    { "label": "Pass", "value": 3, "tone": "success" },
    { "label": "Fail", "value": 2, "tone": "danger" }
  ],
  "centerLabel": "3/5"
}
```

## render_chart

Bar or line series — results over time, counts per workspace.

| Parameter | Type | Req | Notes |
|---|---|---|---|
| `title` | string | no | |
| `kind` | `"bar" \| "line"` | yes | |
| `xLabel`, `yLabel` | string | no | Axis labels |
| `series` | `{ name?, points: { x: string \| number, y: number }[] }[]` | yes | One or more series |

```json
{
  "title": "Failures by workspace",
  "kind": "bar",
  "series": [ { "points": [ { "x": "Sales", "y": 4 }, { "x": "Finance", "y": 1 } ] } ]
}
```

## render_card

A headline block — run summary, a single rule's identity, a confirmation of a save.

| Parameter | Type | Req | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `subtitle` | string | no | |
| `body` | string | no | One short paragraph, plain text |
| `items` | `{ label, value }[]` | no | Label/value facts (rule id, version, severity…) |
| `tone` | `"info" \| "success" \| "warning" \| "danger" \| "neutral"` | no | Accent colour (default neutral) |

```json
{
  "title": "Rule saved",
  "subtitle": "ws-admin-groups-001 · version 2",
  "items": [ { "label": "Severity", "value": "ERROR" }, { "label": "Applies to", "value": "Workspace" } ],
  "tone": "success"
}
```

## render_badge

A single inline status token — current/superseded, pass/fail, severity.

| Parameter | Type | Req | Notes |
|---|---|---|---|
| `label` | string | yes | Short, e.g. `"current"`, `"FAIL"` |
| `tone` | `"info" \| "success" \| "warning" \| "danger" \| "neutral"` | no | Default neutral |
| `detail` | string | no | Small trailing text, e.g. `"since v2"` |

```json
{ "label": "v3 · current", "tone": "success", "detail": "created 2026-06-10" }
```

## render_code

Source code — FRL above all, also JSON specs. **Send the raw source string; never wrap it in
markdown fences.**

| Parameter | Type | Req | Notes |
|---|---|---|---|
| `code` | string | yes | Raw source, newlines included |
| `language` | string | no | e.g. `"frl"`, `"json"` — used as a label/highlight hint |
| `title` | string | no | e.g. the rule file name |

```json
{
  "title": "ws-admin-groups-001.frl",
  "language": "frl",
  "code": "RULE ws-admin-groups-001 {\n    NAME: \"Workspace must have designated Entra admin groups\"\n    ...\n}"
}
```
