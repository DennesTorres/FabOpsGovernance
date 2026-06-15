import { useComponent } from '@copilotkit/react-core/v2';
import {
  renderBadgeSchema,
  renderCardSchema,
  renderChartSchema,
  renderCodeSchema,
  renderDonutSchema,
  renderKpiSchema,
  renderTableSchema,
} from './schemas';
import {
  RenderBadge,
  RenderCard,
  RenderChart,
  RenderCode,
  RenderDonut,
  RenderKpi,
  RenderTable,
} from './RenderPrimitives';

/**
 * Registers the display-only render tools as components-as-tools. CopilotKit forwards them
 * in RunAgentInput.tools on every run; the backend declares them to the model; when the model
 * calls one, CopilotKit renders the component inline with the (streaming) tool arguments as
 * props. There is no handler anywhere — these are render-only by design.
 *
 * Names and schemas are the contract in docs/ui-render-primitives.md; descriptions are what
 * the model reads when choosing a tool.
 */
export function RenderPrimitivesRegistrar() {
  useComponent({
    name: 'render_table',
    description:
      'Table — use when the answer is a set of items the user needs to compare side by side. Ideal for the ' +
      'per-item results of a compliance scan — each Fabric item (workspace, lakehouse, semantic model, ' +
      'capacity, pipeline) with whether it passed, failed, or errored against a rule and the reason — so ' +
      'the user can see exactly which items need remediation. Also use for the governance rule catalog ' +
      '(name, severity, scope, status) or a single rule\'s version history. Choose this whenever there are ' +
      'several records that each carry multiple attributes the user will scan across.',
    parameters: renderTableSchema,
    render: RenderTable,
  }, []);

  useComponent({
    name: 'render_donut',
    description:
      'Donut chart — use to show, at a glance, how a single compliance run split across passed / failed / errored — the ' +
      'proportion of evaluated Fabric items in each outcome. Best when the headline the user cares about is ' +
      '"how compliant are we right now" expressed as a fraction or share, rather than the per-item detail. ' +
      'Choose this to summarize the overall health of one scan or one rule\'s coverage across an estate.',
    parameters: renderDonutSchema,
    render: RenderDonut,
  }, []);

  useComponent({
    name: 'render_bar_chart',
    description:
      'Bar chart — use to compare a measure across categories: violations by severity, failing items per ' +
      'workspace, rules per governance domain, or compliant vs non-compliant counts. Choose this when the ' +
      'question is about magnitudes or rankings across named groups — not change over time and not ' +
      'individual records.',
    parameters: renderChartSchema,
    render: (props) => <RenderChart {...props} kind="bar" />,
  }, []);

  useComponent({
    name: 'render_line_chart',
    description:
      'Line chart — use to show how a measure changes over time: the compliance rate week over week, new ' +
      'violations across a release, or open findings trending down over a sprint. Choose this when the ' +
      'question is about a trend or progression along a time axis — not a comparison of separate categories.',
    parameters: renderChartSchema,
    render: (props) => <RenderChart {...props} kind="line" />,
  }, []);

  useComponent({
    name: 'render_card',
    description:
      'Card — use to spotlight one subject with a clear verdict and a few defining facts. Ideal for the summary of ' +
      'a completed compliance run (overall result plus headline counts), a confirmation that a governance ' +
      'rule was created or updated, or the identity of a single rule (its name, severity, version, and ' +
      'current/superseded status). Choose this when the user should grasp the standing of one thing ' +
      'immediately, without reading a full table.',
    parameters: renderCardSchema,
    render: RenderCard,
  }, []);

  useComponent({
    name: 'render_badge',
    description:
      'Badge — use for a single short status the user reads at a glance, inline with the text. Ideal for a rule\'s ' +
      'lifecycle state (current or superseded), its severity level, or one overall pass / fail / error ' +
      'verdict for a single item or run. Choose this when the whole answer is essentially one status about ' +
      'one subject and a card or table would be overkill.',
    parameters: renderBadgeSchema,
    render: RenderBadge,
  }, []);

  useComponent({
    name: 'render_code',
    description:
      'Code block — use to show the exact definition of a governance rule in Fabric Rule Language (FRL), or a structured ' +
      'specification, when the user needs to read or review the actual logic — above all, the proposed FRL ' +
      'of a rule before they approve saving it. Choose this whenever the user must see precisely how a rule ' +
      'is written or what it checks, rather than a plain-language summary of it.',
    parameters: renderCodeSchema,
    render: RenderCode,
  }, []);

  useComponent({
    name: 'render_kpi',
    description:
      'KPI tiles — use to surface headline numbers as visual tiles: a single key metric or a few related ' +
      'counts (about five at most) where the value itself is the point and colour signals significance ' +
      '(pass=green, fail=red, error=amber, info=cyan, highlight=brand, neutral=none). Examples: total ' +
      'items evaluated / passed / failed / errored from a compliance run; the number of rules in the ' +
      'catalog; a single percentage score. Prefer this over a table when there are only a few numbers and ' +
      'no per-item breakdown is needed.',
    parameters: renderKpiSchema,
    render: RenderKpi,
  }, []);

  return null;
}
