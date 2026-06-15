import { z } from 'zod';

/**
 * Parameter schemas of the six display-only render primitives.
 * docs/ui-render-primitives.md is the canonical contract — keep names, fields and casing
 * in sync with it (the backend declares these tools to the model verbatim via AG-UI).
 */

export const toneSchema = z.enum(['info', 'success', 'warning', 'danger', 'neutral']);
export type Tone = z.infer<typeof toneSchema>;

export const renderTableSchema = z.object({
  title: z.string().optional().describe('Short heading above the table'),
  columns: z
    .array(z.object({
      key: z.string().describe('Field name that addresses values in rows'),
      label: z.string().describe('Column header text'),
      align: z.enum(['left', 'center', 'right']).optional(),
    }))
    .describe('Column definitions, in display order'),
  rows: z
    .array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .describe('Row objects keyed by column key. Raw values only - statuses as pass/fail/error/warning strings'),
  footnote: z.string().optional().describe('Small note under the table, e.g. skipped checks'),
});
export type RenderTableProps = z.infer<typeof renderTableSchema>;

export const renderDonutSchema = z.object({
  title: z.string().optional(),
  slices: z
    .array(z.object({
      label: z.string(),
      value: z.number().describe('Non-negative magnitude of this slice'),
      tone: toneSchema.optional(),
    }))
    .describe('The proportional breakdown to draw'),
  centerLabel: z.string().optional().describe('Text in the donut hole, e.g. "3/5"'),
});
export type RenderDonutProps = z.infer<typeof renderDonutSchema>;

// Bar and line are separate tools (render_bar_chart / render_line_chart) so the model chooses by
// intent — comparison vs. trend. `kind` is fixed at registration, not chosen by the model, so it
// is deliberately absent from this schema. Both tools share this shape.
export const renderChartSchema = z.object({
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  series: z
    .array(z.object({
      name: z.string().optional(),
      points: z.array(z.object({
        x: z.union([z.string(), z.number()]),
        y: z.number(),
      })),
    }))
    .describe('One or more data series'),
});
export type RenderChartProps = z.infer<typeof renderChartSchema> & { kind?: 'bar' | 'line' };

export const renderCardSchema = z.object({
  title: z.string().describe('Headline'),
  subtitle: z.string().optional(),
  body: z.string().optional().describe('One short plain-text paragraph'),
  items: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional()
    .describe('Label/value facts such as rule id, version, severity'),
  tone: toneSchema.optional().describe('Accent colour reflecting the overall verdict'),
});
export type RenderCardProps = z.infer<typeof renderCardSchema>;

export const renderBadgeSchema = z.object({
  label: z.string().describe('Short status token, e.g. "v3 · current" or "FAIL"'),
  tone: toneSchema.optional(),
  detail: z.string().optional().describe('Small trailing text'),
});
export type RenderBadgeProps = z.infer<typeof renderBadgeSchema>;

export const renderCodeSchema = z.object({
  code: z.string().describe('Raw source string with newlines - NEVER wrapped in markdown fences'),
  language: z.string().optional().describe('e.g. "frl" or "json" - shown as a label'),
  title: z.string().optional().describe('e.g. the rule file name'),
});
export type RenderCodeProps = z.infer<typeof renderCodeSchema>;

export const renderKpiSchema = z.object({
  items: z
    .array(z.object({
      label: z.string().describe('Caption under the number'),
      value: z.string().describe('The headline value as a string, e.g. "12", "87%", "3/5"'),
      sublabel: z.string().optional().describe('Small secondary line under the label'),
      tone: z
        .enum(['pass', 'fail', 'error', 'info', 'highlight', 'neutral'])
        .optional()
        .describe('Colour signal: pass=green, fail=red, error=amber, info=cyan, highlight=brand, neutral=none'),
    }))
    .describe('One or more KPI tiles (about five at most)'),
});
export type RenderKpiProps = z.infer<typeof renderKpiSchema>;
