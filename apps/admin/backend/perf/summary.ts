import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const LAYOUT_PHASE = 'Laying out ballots';
export const RENDER_PHASE = 'Rendering ballot PDFs';

export interface PhaseTimes {
  startMs: number;
  layoutStartMs?: number;
  renderStartMs?: number;
  renderEndMs?: number;
  endMs?: number;
}

export interface RunConfig {
  readonly label: string;
  readonly election: string;
  readonly pool: number;
  readonly modes: readonly string[];
  readonly stats: {
    readonly ballotStyles: number;
    readonly precincts: number;
    readonly contests: number;
    readonly candidates: number;
  };
  readonly expectedPdfs: number;
  readonly startedAtMs: number;
}

export interface RunResult {
  readonly status: 'succeeded' | 'failed';
  readonly error?: string;
  readonly phases: PhaseTimes;
  readonly pdfCount: number;
  readonly pagesPerPdf?: { min: number; max: number };
  readonly outputBytes?: number;
}

type Row = Record<string, string>;

function readCsv(path: string): Row[] {
  if (!existsSync(path)) return [];
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  if (!header) return [];
  const columns = header.split(',');
  return lines
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells = line.split(',');
      return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? '']));
    });
}

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function num(row: Row | undefined, column: string): number {
  const value = row?.[column];
  return value === undefined || value === '' ? Number.NaN : Number(value);
}

function max(values: number[]): number | undefined {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : undefined;
}

function min(values: number[]): number | undefined {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Math.min(...finite) : undefined;
}

function mean(values: number[]): number | undefined {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0
    ? finite.reduce((a, b) => a + b, 0) / finite.length
    : undefined;
}

function slope(points: Array<[number, number]>): number | undefined {
  if (points.length < 3) return undefined;
  const mx = mean(points.map(([x]) => x)) ?? 0;
  const my = mean(points.map(([, y]) => y)) ?? 0;
  let numerator = 0;
  let denominator = 0;
  for (const [x, y] of points) {
    numerator += (x - mx) * (y - my);
    denominator += (x - mx) ** 2;
  }
  return denominator === 0 ? undefined : numerator / denominator;
}

function phasesFromProgress(progress: Row[], startMs: number): PhaseTimes {
  const phases: PhaseTimes = { startMs };
  for (const row of progress) {
    const t = num(row, 't_ms');
    if (row['phase'] === LAYOUT_PHASE && phases.layoutStartMs === undefined) {
      phases.layoutStartMs = t;
    }
    if (row['phase'] === RENDER_PHASE) {
      phases.renderStartMs ??= t;
      if (num(row, 'progress') === num(row, 'total')) phases.renderEndMs = t;
    }
  }
  return phases;
}

export interface TimelinePoint {
  readonly tMs: number;
  readonly phase: string;
  readonly layoutsDone: number;
  readonly pdfsRendered: number;
  readonly heapUsedKb: number;
  readonly system: Row;
}

function buildTimeline(system: Row[], progress: Row[]): TimelinePoint[] {
  let index = -1;
  let layoutTotal = 0;
  return system.map((row) => {
    const t = num(row, 't_ms');
    while (
      index + 1 < progress.length &&
      num(progress[index + 1], 't_ms') <= t
    ) {
      index += 1;
      if (progress[index]?.['phase'] === LAYOUT_PHASE) {
        layoutTotal = num(progress[index], 'total');
      }
    }
    const current = index >= 0 ? progress[index] : undefined;
    const phase = current?.['phase'] ?? 'setup';
    const value = num(current, 'progress');
    return {
      tMs: t,
      phase,
      layoutsDone:
        phase === LAYOUT_PHASE
          ? value
          : phase === RENDER_PHASE || phase === 'package' || phase === 'done'
            ? layoutTotal
            : 0,
      pdfsRendered:
        phase === RENDER_PHASE
          ? value
          : phase === 'package' || phase === 'done'
            ? num(current, 'total')
            : 0,
      heapUsedKb: num(current, 'heap_used_kb'),
      system: row,
    };
  });
}

function roleSeries(processes: Row[]): Map<string, Map<number, number>> {
  const byRole = new Map<string, Map<number, number>>();
  for (const row of processes) {
    const role = row['role'] ?? 'unknown';
    const series = byRole.get(role) ?? new Map<number, number>();
    const t = num(row, 't_ms');
    series.set(t, (series.get(t) ?? 0) + num(row, 'pss_kb'));
    byRole.set(role, series);
  }
  return byRole;
}

function mb(kb?: number) {
  return kb === undefined ? undefined : Math.round(kb / 1024);
}
function seconds(ms?: number) {
  return ms === undefined ? undefined : Math.round(ms / 100) / 10;
}

export type RunSummary = Record<string, string | number | undefined>;

/** Summarizes one run directory and writes summary.json and timeline.csv. */
export function summarizeRun(dir: string): RunSummary | undefined {
  const config = readJson(join(dir, 'config.json')) as RunConfig | undefined;
  if (!config) return undefined;
  const result = readJson(join(dir, 'result.json')) as RunResult | undefined;
  const system = readCsv(join(dir, 'system.csv'));
  const progress = readCsv(join(dir, 'progress.csv'));
  const processes = readCsv(join(dir, 'processes.csv'));

  const phases =
    result?.phases ?? phasesFromProgress(progress, config.startedAtMs);
  const endMs = phases.endMs ?? num(system.at(-1), 't_ms');
  function inRun(t: number) {
    return t >= phases.startMs && t <= endMs;
  }
  const runSystem = system.filter((row) => inRun(num(row, 't_ms')));
  const timeline = buildTimeline(runSystem, progress);

  function col(rows: Row[], column: string) {
    return rows.map((r) => num(r, column));
  }
  function during(start?: number, end?: number) {
    return runSystem.filter((row) => {
      const t = num(row, 't_ms');
      return start !== undefined && end !== undefined && t >= start && t <= end;
    });
  }
  const busyRows = during(phases.layoutStartMs, phases.renderEndMs);
  const layoutRows = during(phases.layoutStartMs, phases.renderStartMs);
  const renderRows = during(phases.renderStartMs, phases.renderEndMs);

  function pssSlope(
    column: string,
    rows: TimelinePoint[],
    x: (p: TimelinePoint) => number
  ) {
    const s = slope(rows.map((p) => [x(p), num(p.system, column)]));
    return s === undefined ? undefined : Math.round((s * 1000) / 1024);
  }
  const renderTimeline = timeline.filter((p) => p.phase === RENDER_PHASE);
  const layoutTimeline = timeline.filter((p) => p.phase === LAYOUT_PHASE);
  const heapRenderSlope = slope(
    renderTimeline.map((p) => [p.pdfsRendered, p.heapUsedKb])
  );

  const throttleCounts = col(runSystem, 'package_throttle_count');
  const swapAtStart = num(runSystem[0], 'swap_used_kb');
  const memTotal = num(runSystem[0], 'mem_total_kb');
  const roles = roleSeries(processes.filter((row) => inRun(num(row, 't_ms'))));
  const rolePeaks = Object.fromEntries(
    [...roles.entries()].map(([role, series]) => [
      `peak_pss_mb_${role}`,
      mb(max([...series.values()])),
    ])
  );
  const singleRendererPeak = max(
    processes
      .filter((row) => row['role'] === 'chromium-renderer')
      .map((row) => num(row, 'pss_kb'))
  );

  const pdfs =
    result?.pdfCount ?? max(timeline.map((p) => p.pdfsRendered)) ?? 0;
  const wallMs = endMs - phases.startMs;
  const summary: RunSummary = {
    run: basename(dir),
    label: config.label,
    election: config.election,
    pool: config.pool,
    modes: config.modes.join('+'),
    styles: config.stats.ballotStyles,
    precincts: config.stats.precincts,
    contests: config.stats.contests,
    expected_pdfs: config.expectedPdfs,
    pdfs,
    status: result?.status ?? 'crashed',
    error: result?.error,
    wall_s: seconds(wallMs),
    setup_s: seconds(
      phases.layoutStartMs === undefined
        ? undefined
        : phases.layoutStartMs - phases.startMs
    ),
    layout_s: seconds(
      phases.renderStartMs === undefined || phases.layoutStartMs === undefined
        ? undefined
        : phases.renderStartMs - phases.layoutStartMs
    ),
    render_s: seconds(
      phases.renderEndMs === undefined || phases.renderStartMs === undefined
        ? undefined
        : phases.renderEndMs - phases.renderStartMs
    ),
    package_s: seconds(
      phases.renderEndMs === undefined ? undefined : endMs - phases.renderEndMs
    ),
    s_per_pdf: pdfs > 0 ? Math.round((wallMs / pdfs) * 10) / 10000 : undefined,
    pages_per_pdf: result?.pagesPerPdf
      ? `${result.pagesPerPdf.min}-${result.pagesPerPdf.max}`
      : undefined,
    peak_tree_pss_mb: mb(max(col(runSystem, 'tree_pss_kb'))),
    peak_tree_rss_mb: mb(max(col(runSystem, 'tree_rss_kb'))),
    peak_node_pss_mb: mb(max(col(runSystem, 'node_pss_kb'))),
    peak_node_rss_mb: mb(max(col(runSystem, 'node_rss_kb'))),
    peak_heap_used_mb: mb(max(col(progress, 'heap_used_kb'))),
    peak_chromium_pss_mb: mb(max(col(runSystem, 'chromium_pss_kb'))),
    peak_single_renderer_pss_mb: mb(singleRendererPeak),
    max_chromium_processes: max(col(runSystem, 'chromium_processes')),
    ...rolePeaks,
    mem_total_mb: mb(memTotal),
    min_mem_available_mb: mb(min(col(runSystem, 'mem_available_kb'))),
    peak_system_used_mb: mb(
      max(
        col(runSystem, 'mem_available_kb').map(
          (available) => memTotal - available
        )
      )
    ),
    swap_used_at_start_mb: mb(swapAtStart),
    peak_swap_used_mb: mb(max(col(runSystem, 'swap_used_kb'))),
    avg_freq_mhz: mean(col(busyRows, 'freq_avg_mhz'))?.toFixed(0),
    min_avg_freq_mhz: min(col(busyRows, 'freq_avg_mhz'))?.toFixed(0),
    max_temp_c: max(col(runSystem, 'temp_max_c')),
    throttle_events:
      throttleCounts.length > 0 && Number.isFinite(throttleCounts[0])
        ? (max(throttleCounts) ?? 0) - (throttleCounts[0] ?? 0)
        : undefined,
    avg_cpu_busy_pct: mean(col(busyRows, 'cpu_busy_pct'))?.toFixed(0),
    layout_node_main_thread_cpu_pct: mean(
      col(layoutRows, 'node_main_thread_cpu_pct')
    )?.toFixed(0),
    render_node_main_thread_cpu_pct: mean(
      col(renderRows, 'node_main_thread_cpu_pct')
    )?.toFixed(0),
    layout_chromium_cpu_pct: mean(col(layoutRows, 'chromium_cpu_pct'))?.toFixed(
      0
    ),
    render_chromium_cpu_pct: mean(col(renderRows, 'chromium_cpu_pct'))?.toFixed(
      0
    ),
    max_event_loop_lag_ms: max(col(progress, 'event_loop_lag_ms')),
    peak_scratch_mb: mb((max(col(runSystem, 'watched_bytes')) ?? 0) / 1024),
    peak_fs_used_delta_mb: mb(
      (max(col(runSystem, 'fs_used_delta_bytes')) ?? 0) / 1024
    ),
    output_mb:
      result?.outputBytes === undefined
        ? undefined
        : mb(result.outputBytes / 1024),
    layout_tree_pss_mb_per_1k: pssSlope(
      'tree_pss_kb',
      layoutTimeline,
      (p) => p.layoutsDone
    ),
    render_tree_pss_mb_per_1k: pssSlope(
      'tree_pss_kb',
      renderTimeline,
      (p) => p.pdfsRendered
    ),
    render_node_pss_mb_per_1k: pssSlope(
      'node_pss_kb',
      renderTimeline,
      (p) => p.pdfsRendered
    ),
    render_chromium_pss_mb_per_1k: pssSlope(
      'chromium_pss_kb',
      renderTimeline,
      (p) => p.pdfsRendered
    ),
    render_heap_mb_per_1k:
      heapRenderSlope === undefined
        ? undefined
        : Math.round((heapRenderSlope * 1000) / 1024),
  };

  const timelineColumns = [
    't_s',
    'phase',
    'layouts_done',
    'pdfs_rendered',
    'tree_pss_mb',
    'node_pss_mb',
    'chromium_pss_mb',
    'heap_used_mb',
    'mem_available_mb',
    'swap_used_mb',
    'freq_avg_mhz',
    'temp_max_c',
    'node_main_thread_cpu_pct',
    'chromium_cpu_pct',
    'scratch_mb',
  ];
  const timelineRows = timeline.map((p) =>
    [
      ((p.tMs - phases.startMs) / 1000).toFixed(1),
      p.phase,
      p.layoutsDone,
      p.pdfsRendered,
      mb(num(p.system, 'tree_pss_kb')),
      mb(num(p.system, 'node_pss_kb')),
      mb(num(p.system, 'chromium_pss_kb')),
      mb(p.heapUsedKb),
      mb(num(p.system, 'mem_available_kb')),
      mb(num(p.system, 'swap_used_kb')),
      p.system['freq_avg_mhz'],
      p.system['temp_max_c'],
      p.system['node_main_thread_cpu_pct'],
      p.system['chromium_cpu_pct'],
      mb(num(p.system, 'watched_bytes') / 1024),
    ].join(',')
  );
  writeFileSync(
    join(dir, 'timeline.csv'),
    `${[timelineColumns.join(','), ...timelineRows].join('\n')}\n`
  );
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

/** Summarizes an idle baseline directory. */
export function summarizeBaseline(dir: string): RunSummary | undefined {
  const system = readCsv(join(dir, 'system.csv'));
  if (system.length === 0 || existsSync(join(dir, 'config.json'))) {
    return undefined;
  }
  const memTotal = num(system[0], 'mem_total_kb');
  function col(column: string) {
    return system.map((r) => num(r, column));
  }
  const summary: RunSummary = {
    run: basename(dir),
    label: 'idle baseline',
    status: 'baseline',
    wall_s: seconds(num(system.at(-1), 't_ms') - num(system[0], 't_ms')),
    mem_total_mb: mb(memTotal),
    min_mem_available_mb: mb(min(col('mem_available_kb'))),
    peak_system_used_mb: mb(
      max(col('mem_available_kb').map((a) => memTotal - a))
    ),
    avg_system_used_mb: mb(
      mean(col('mem_available_kb').map((a) => memTotal - a))
    ),
    peak_swap_used_mb: mb(max(col('swap_used_kb'))),
    avg_freq_mhz: mean(col('freq_avg_mhz'))?.toFixed(0),
    max_temp_c: max(col('temp_max_c')),
    avg_cpu_busy_pct: mean(col('cpu_busy_pct'))?.toFixed(0),
  };
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

const TABLE_COLUMNS: Array<[string, string]> = [
  ['run', 'Run'],
  ['election', 'Election'],
  ['pool', 'Pool'],
  ['modes', 'Modes'],
  ['styles', 'Styles'],
  ['pdfs', 'PDFs'],
  ['status', 'Status'],
  ['wall_s', 'Wall s'],
  ['layout_s', 'Layout s'],
  ['render_s', 'Render s'],
  ['package_s', 'Package s'],
  ['s_per_pdf', 's/PDF'],
  ['pages_per_pdf', 'Pages'],
  ['peak_tree_pss_mb', 'Peak tree PSS MB'],
  ['peak_node_pss_mb', 'Peak node PSS MB'],
  ['peak_heap_used_mb', 'Peak heap MB'],
  ['peak_chromium_pss_mb', 'Peak Chromium PSS MB'],
  ['peak_system_used_mb', 'Peak system used MB'],
  ['min_mem_available_mb', 'Min available MB'],
  ['peak_swap_used_mb', 'Peak swap MB'],
  ['avg_freq_mhz', 'Avg MHz'],
  ['min_avg_freq_mhz', 'Min MHz'],
  ['max_temp_c', 'Max °C'],
  ['render_node_main_thread_cpu_pct', 'Node main % (render)'],
  ['peak_scratch_mb', 'Peak scratch MB'],
  ['render_tree_pss_mb_per_1k', 'Render PSS MB/1k PDFs'],
];

/**
 * Summarizes every run directory under `root` and writes summary.md and
 * summary.csv there.
 */
export function summarizeResults(root: string): RunSummary[] {
  const summaries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort()
    .map((dir) => summarizeRun(dir) ?? summarizeBaseline(dir))
    .filter((summary): summary is RunSummary => summary !== undefined);

  function format(value?: string | number) {
    return value === undefined ? '' : String(value);
  }
  const markdown = [
    `| ${TABLE_COLUMNS.map(([, title]) => title).join(' | ')} |`,
    `| ${TABLE_COLUMNS.map(() => '---').join(' | ')} |`,
    ...summaries.map(
      (s) => `| ${TABLE_COLUMNS.map(([key]) => format(s[key])).join(' | ')} |`
    ),
  ].join('\n');
  writeFileSync(join(root, 'summary.md'), `${markdown}\n`);

  const keys = [...new Set(summaries.flatMap((s) => Object.keys(s)))];
  const csv = [
    keys.join(','),
    ...summaries.map((s) =>
      keys.map((key) => format(s[key]).replaceAll(',', ';')).join(',')
    ),
  ].join('\n');
  writeFileSync(join(root, 'summary.csv'), `${csv}\n`);
  return summaries;
}
