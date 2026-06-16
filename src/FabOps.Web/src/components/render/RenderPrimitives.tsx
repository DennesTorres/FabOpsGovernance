import {
  RenderBadgeProps,
  RenderCardProps,
  RenderChartProps,
  RenderRuleSourceProps,
  RenderDonutProps,
  RenderKpiProps,
  RenderTableProps,
  Tone,
} from './schemas';

/**
 * The six display-only render primitives (docs/ui-render-primitives.md).
 * Tool arguments stream in while the model writes them, so every component treats every
 * prop as possibly missing and renders what it has without throwing.
 */

const toneClass = (tone?: Tone | null): string => `tone-${tone ?? 'neutral'}`;

const STATUS_VALUES = new Set(['pass', 'fail', 'error', 'warning']);
const statusTone: Record<string, Tone> = { pass: 'success', fail: 'danger', error: 'warning', warning: 'warning' };

function isStatusColumn(key?: string, label?: string): boolean {
  return key?.toLowerCase() === 'status' || label?.toLowerCase() === 'status';
}

export function RenderTable({ title, columns, rows, footnote }: Partial<RenderTableProps>) {
  const cols = (columns ?? []).filter(c => c?.key);
  return (
    <div className="rp rp-table">
      {title && <div className="rp-title">{title}</div>}
      <table>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.key ?? i} style={{ textAlign: c.align ?? 'left' }}>{c.label ?? c.key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row, ri) => (
            <tr key={ri}>
              {cols.map((c, ci) => {
                const raw = row?.[c.key];
                const text = raw === null || raw === undefined ? '' : String(raw);
                const isStatus = isStatusColumn(c.key, c.label) && STATUS_VALUES.has(text.toLowerCase());
                return (
                  <td key={c.key ?? ci} style={{ textAlign: c.align ?? 'left' }}>
                    {isStatus
                      ? <span className={`rp-pill ${toneClass(statusTone[text.toLowerCase()])}`}>{text.toLowerCase()}</span>
                      : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {footnote && <div className="rp-footnote">{footnote}</div>}
    </div>
  );
}

export function RenderDonut({ title, slices, centerLabel }: Partial<RenderDonutProps>) {
  const parts = (slices ?? []).filter(s => s && typeof s.value === 'number' && s.value >= 0);
  const total = parts.reduce((sum, s) => sum + s.value, 0);

  const radius = 15.9155; // circumference ≈ 100, so values map to percentages directly
  let offset = 25; // start at 12 o'clock
  const segments = parts.map((s, i) => {
    const pct = total > 0 ? (s.value / total) * 100 : 0;
    const seg = (
      <circle
        key={i}
        className={`rp-donut-seg ${toneClass(s.tone)}`}
        cx="18" cy="18" r={radius}
        fill="none" strokeWidth="4"
        strokeDasharray={`${pct} ${100 - pct}`}
        strokeDashoffset={offset}
      />
    );
    offset -= pct;
    return seg;
  });

  return (
    <div className="rp rp-donut">
      {title && <div className="rp-title">{title}</div>}
      <div className="rp-donut-body">
        <div className="rp-donut-chart">
          <svg viewBox="0 0 36 36" width="120" height="120" role="img" aria-label={title ?? 'breakdown'}>
            <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="4" className="rp-donut-track" />
            {total > 0 && segments}
          </svg>
          {centerLabel && <div className="rp-donut-center">{centerLabel}</div>}
        </div>
        <ul className="rp-legend">
          {parts.map((s, i) => (
            <li key={i}>
              <span className={`rp-swatch ${toneClass(s.tone)}`} />
              <span className="rp-legend-label">{s.label ?? ''}</span>
              <span className="rp-legend-value">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RenderChart({ title, kind, xLabel, yLabel, series }: Partial<RenderChartProps>) {
  const allSeries = (series ?? []).filter(s => s?.points?.length);
  const points = allSeries.flatMap(s => s.points ?? []);
  const maxY = Math.max(1, ...points.map(p => (typeof p?.y === 'number' ? p.y : 0)));

  const width = 320;
  const height = 160;
  const padding = 24;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  // Category positions follow the first series' x order.
  const categories = [...new Map(points.map(p => [String(p.x), true])).keys()];
  const xPos = (x: string | number) => {
    const idx = Math.max(0, categories.indexOf(String(x)));
    const slot = plotW / Math.max(1, categories.length);
    return padding + slot * idx + slot / 2;
  };
  const yPos = (y: number) => padding + plotH - (y / maxY) * plotH;

  return (
    <div className="rp rp-chart">
      {title && <div className="rp-title">{title}</div>}
      <svg viewBox={`0 0 ${width} ${height + 16}`} width="100%" role="img" aria-label={title ?? 'chart'}>
        <line x1={padding} y1={padding + plotH} x2={width - padding} y2={padding + plotH} className="rp-axis" />
        <line x1={padding} y1={padding} x2={padding} y2={padding + plotH} className="rp-axis" />

        {kind === 'line'
          ? allSeries.map((s, si) => (
              <polyline
                key={si}
                className={`rp-line rp-series-${si % 4}`}
                fill="none"
                points={(s.points ?? [])
                  .filter(p => typeof p?.y === 'number')
                  .map(p => `${xPos(p.x)},${yPos(p.y)}`)
                  .join(' ')}
              />
            ))
          : allSeries.map((s, si) =>
              (s.points ?? []).filter(p => typeof p?.y === 'number').map((p, pi) => {
                const slot = plotW / Math.max(1, categories.length);
                const barW = Math.max(6, (slot - 8) / Math.max(1, allSeries.length));
                const x = xPos(p.x) - (barW * allSeries.length) / 2 + barW * si;
                return (
                  <rect
                    key={`${si}-${pi}`}
                    className={`rp-bar rp-series-${si % 4}`}
                    x={x}
                    y={yPos(p.y)}
                    width={barW}
                    height={Math.max(0, padding + plotH - yPos(p.y))}
                    rx="2"
                  />
                );
              }))}

        {categories.map((c, i) => (
          <text key={i} x={xPos(c)} y={padding + plotH + 14} textAnchor="middle" className="rp-tick">{c}</text>
        ))}
        {xLabel && <text x={width / 2} y={height + 12} textAnchor="middle" className="rp-axis-label">{xLabel}</text>}
        {yLabel && (
          <text x={10} y={height / 2} textAnchor="middle" className="rp-axis-label" transform={`rotate(-90 10 ${height / 2})`}>
            {yLabel}
          </text>
        )}
      </svg>
      {allSeries.some(s => s.name) && (
        <ul className="rp-legend rp-legend-row">
          {allSeries.map((s, i) => (
            <li key={i}><span className={`rp-swatch rp-series-${i % 4}`} />{s.name ?? `Series ${i + 1}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RenderCard({ title, subtitle, body, items, tone }: Partial<RenderCardProps>) {
  return (
    <div className={`rp rp-card ${toneClass(tone)}`}>
      <div className="rp-card-accent" />
      <div className="rp-card-content">
        {title && <div className="rp-card-title">{title}</div>}
        {subtitle && <div className="rp-card-subtitle">{subtitle}</div>}
        {body && <p className="rp-card-body">{body}</p>}
        {!!items?.length && (
          <dl className="rp-card-items">
            {items.map((item, i) => (
              <div key={i} className="rp-card-item">
                <dt>{item?.label ?? ''}</dt>
                <dd>{item?.value ?? ''}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

export function RenderBadge({ label, tone, detail }: Partial<RenderBadgeProps>) {
  return (
    <span className="rp rp-badge-wrap">
      <span className={`rp-pill ${toneClass(tone)}`}>{label ?? ''}</span>
      {detail && <span className="rp-badge-detail">{detail}</span>}
    </span>
  );
}

// An FRL rule body opens with `RULE <id> {`; its top-level keywords (docs/frl-language.md) each
// begin their own line. FRL_ALREADY_FORMATTED detects a rule that still has its line breaks.
const FRL_RULE = /^\s*RULE\s+[^\s{]+\s*\{/;
const FRL_ALREADY_FORMATTED = /\n\s*(NAME|VERSION|SEVERITY|APPLIES_TO|PARAMS|CHECK|FINDING|REMEDIATION)\b/;

/**
 * Best-effort pretty-print for an FRL rule that arrived flattened onto one line — its newlines
 * stripped upstream, leaving only alignment spaces. Re-inserts a break before each top-level
 * keyword so the rule reads as written. FRL that already carries its own line breaks, and any
 * non-FRL string, is returned untouched. Keyword `:` anchors and the start/end `{`/`}` anchors
 * keep it from touching string literals (e.g. the `{displayName}` inside a FINDING message). This
 * is intentionally FRL-specific — render_rule_source only ever carries FRL.
 */
function formatRuleSource(src: string): string {
  if (!FRL_RULE.test(src) || FRL_ALREADY_FORMATTED.test(src)) return src;
  return src
    .replace(/[ \t]{2,}/g, ' ')                                                          // drop alignment padding
    .trim()
    .replace(/^(\s*RULE\s+[^\s{]+)\s*\{\s*/i, '$1 {\n  ')                                 // break after the opening brace
    .replace(/\s+(NAME|VERSION|SEVERITY|APPLIES_TO|FINDING|REMEDIATION):/g, '\n  $1:')    // `keyword:` fields
    .replace(/\s+(CHECK)\s+/g, '\n  $1 ')                                                 // CHECK lines (no colon)
    .replace(/\s+(PARAMS)\s*\{/g, '\n  $1 {')                                             // PARAMS block
    .replace(/\s*\}\s*$/, '\n}');                                                         // break before the final brace
}

export function RenderRuleSource({ code, language, title }: Partial<RenderRuleSourceProps>) {
  const display = code ? formatRuleSource(code) : '';
  return (
    <div className="rp rp-code">
      {(title || language) && (
        <div className="rp-code-hdr">
          <span className="rp-code-title">{title ?? ''}</span>
          {language && <span className="rp-code-lang">{language}</span>}
        </div>
      )}
      <pre><code>{display}</code></pre>
    </div>
  );
}

export function RenderKpi({ items }: Partial<RenderKpiProps>) {
  const tiles = (items ?? []).filter(t => t && t.value !== undefined);
  return (
    <div className="rp rp-kpi">
      {tiles.map((t, i) => (
        <div key={i} className={`rp-kpi-tile rp-kpi-${t.tone ?? 'neutral'}`}>
          <div className="rp-kpi-value">{t.value ?? ''}</div>
          <div className="rp-kpi-label">{t.label ?? ''}</div>
          {t.sublabel && <div className="rp-kpi-sublabel">{t.sublabel}</div>}
        </div>
      ))}
    </div>
  );
}
