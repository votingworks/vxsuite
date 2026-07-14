import { assertDefined, sleep } from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { CircleCiClient } from '../src/circleci_client';
import {
  circleCiGet,
  DEFAULT_PROJECT_SLUG,
  TERMINAL_WORKFLOW_STATUSES,
  uploadPackage,
} from './trigger_nh_qa';

// Pace the trigger API calls so a large batch doesn't trip CircleCI's API rate
// limit, and space out status polls.
const TRIGGER_DELAY_MS = 1500;
const POLL_ROUND_INTERVAL_MS = 20_000;
const POLL_SPACING_MS = 300;

// Artifacts we pull locally for failed towns so results can be triaged offline.
const FAILURE_ARTIFACT_NAMES = new Set(['run.log', 'report.html']);

interface Args {
  outDir: string;
  projectSlug: string;
  triggerDelayMs: number;
  maxInflight: number;
}

function parseArgs(argv: readonly string[]): Args | undefined {
  const positionals: string[] = [];
  let projectSlug = DEFAULT_PROJECT_SLUG;
  let triggerDelayMs = TRIGGER_DELAY_MS;
  let maxInflight = Number.POSITIVE_INFINITY;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--slug') {
      i += 1;
      projectSlug = argv[i];
    } else if (arg === '--trigger-delay-ms') {
      i += 1;
      const parsed = safeParseNumber(argv[i]);
      if (parsed.isErr()) {
        console.error(`Invalid --trigger-delay-ms: ${argv[i]}`);
        return undefined;
      }
      triggerDelayMs = parsed.ok();
    } else if (arg === '--max-inflight') {
      i += 1;
      const parsed = safeParseNumber(argv[i]);
      if (parsed.isErr() || parsed.ok() < 1) {
        console.error(`Invalid --max-inflight (must be >= 1): ${argv[i]}`);
        return undefined;
      }
      maxInflight = parsed.ok();
    } else if (arg.startsWith('--')) {
      console.error(`Unknown flag: ${arg}`);
      return undefined;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    return undefined;
  }
  return { outDir: positionals[0], projectSlug, triggerDelayMs, maxInflight };
}

interface TownPackage {
  town: string;
  zipPath: string;
}

// render_nh_election_package writes <outDir>/<Town>/election-package-*.zip.
function discoverPackages(outDir: string): TownPackage[] {
  const packages: TownPackage[] = [];
  for (const town of readdirSync(outDir).sort()) {
    const townDir = join(outDir, town);
    if (!statSync(townDir).isDirectory()) continue;
    const zipName = readdirSync(townDir).find(
      (f) => f.startsWith('election-package-') && f.endsWith('.zip')
    );
    if (zipName) {
      packages.push({ town, zipPath: join(townDir, zipName) });
    }
  }
  return packages;
}

interface Enqueued extends TownPackage {
  pipelineId: string;
  pipelineUrl: string;
}

interface WorkflowState {
  status: string;
  workflowId: string;
}

async function pollWorkflow(
  pipelineId: string,
  token: string
): Promise<WorkflowState | undefined> {
  const workflows = ((
    await circleCiGet(`/pipeline/${pipelineId}/workflow`, token)
  )['items'] ?? []) as Array<{ id: string; status: string }>;
  const workflow = workflows[0];
  return workflow
    ? { status: workflow.status, workflowId: workflow.id }
    : undefined;
}

interface JobInfo {
  name: string;
  jobNumber?: number;
  url: string;
}

async function fetchJobs(
  workflowId: string,
  projectSlug: string,
  token: string
): Promise<JobInfo[]> {
  const jobs = ((await circleCiGet(`/workflow/${workflowId}/job`, token))[
    'items'
  ] ?? []) as Array<{ job_number?: number; name: string }>;
  return jobs.map((job) => ({
    name: job.name,
    jobNumber: job.job_number,
    url: job.job_number
      ? `https://app.circleci.com/pipelines/${projectSlug}/jobs/${job.job_number}`
      : '(not started)',
  }));
}

// Best-effort: pull run.log/report.html for a failed town into destDir so the
// failure can be read locally instead of via expiring artifact URLs.
async function downloadFailureArtifacts(
  jobs: readonly JobInfo[],
  projectSlug: string,
  token: string,
  destDir: string
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  for (const job of jobs) {
    if (!job.jobNumber) continue;
    let items: Array<{ path: string; url: string }>;
    try {
      items = ((
        await circleCiGet(
          `/project/${projectSlug}/${job.jobNumber}/artifacts`,
          token
        )
      )['items'] ?? []) as Array<{ path: string; url: string }>;
    } catch {
      continue;
    }
    for (const artifact of items) {
      if (!FAILURE_ARTIFACT_NAMES.has(basename(artifact.path))) continue;
      try {
        const response = await fetch(artifact.url, {
          headers: { 'Circle-Token': token },
        });
        if (response.ok) {
          await writeFile(
            join(destDir, basename(artifact.path)),
            Buffer.from(await response.arrayBuffer())
          );
        }
      } catch {
        // Best effort -- the pipeline URL in the summary is the fallback.
      }
    }
  }
}

interface TownResult {
  town: string;
  status: string;
  passed: boolean;
  pipelineUrl: string;
  jobs: string[];
}

interface BatchResult {
  results: TownResult[];
  failedTowns: string[];
}

/**
 * Runs QA for every package, keeping at most `maxInflight` pipelines running at
 * once (Infinity = enqueue all up front and let CircleCI's queue do the
 * limiting). As running pipelines reach a terminal state, new ones are
 * triggered to keep the window full.
 */
async function runBatch(
  packages: readonly TownPackage[],
  token: string,
  projectSlug: string,
  triggerDelayMs: number,
  maxInflight: number
): Promise<BatchResult> {
  const circleCi = new CircleCiClient(token, projectSlug);
  const queue = [...packages];
  const inflight = new Map<string, Enqueued>();
  const results: TownResult[] = [];
  const failedTowns: string[] = [];
  const total = packages.length;
  let triggered = 0;

  while (queue.length > 0 || inflight.size > 0) {
    // Fill the concurrency window.
    while (queue.length > 0 && inflight.size < maxInflight) {
      const pkg = assertDefined(queue.shift());
      triggered += 1;
      try {
        const exportPackageUrl = await uploadPackage(pkg.zipPath);
        const result = await circleCi.triggerPipeline({
          exportPackageUrl,
          // Results are read from the CircleCI pipeline below, not a webhook.
          webhookUrl: '',
          qaRunId: randomUUID(),
          electionId: pkg.town,
        });
        const pipelineUrl = `https://app.circleci.com/pipelines/${projectSlug}/${result.pipelineNumber}`;
        inflight.set(result.pipelineId, {
          ...pkg,
          pipelineId: result.pipelineId,
          pipelineUrl,
        });
        console.log(
          `[${triggered}/${total}] queued ${pkg.town} ` +
            `(${inflight.size} running, ${queue.length} waiting): ${pipelineUrl}`
        );
      } catch (error) {
        failedTowns.push(pkg.town);
        console.error(
          `[${triggered}/${total}] FAILED to enqueue ${pkg.town}: ${error}`
        );
      }
      // Pace the trigger API calls.
      await sleep(triggerDelayMs);
    }

    // Poll in-flight pipelines; collect any that have finished.
    for (const [pipelineId, e] of [...inflight]) {
      // A transient CircleCI API error shouldn't crash the loop -- leave the
      // pipeline in-flight and retry it next round.
      try {
        const state = await pollWorkflow(pipelineId, token);
        if (state && TERMINAL_WORKFLOW_STATUSES.has(state.status)) {
          const passed = state.status === 'success';
          const jobs = await fetchJobs(state.workflowId, projectSlug, token);
          if (!passed) {
            await downloadFailureArtifacts(
              jobs,
              projectSlug,
              token,
              join(dirname(e.zipPath), 'qa-report')
            );
          }
          results.push({
            town: e.town,
            status: state.status,
            passed,
            pipelineUrl: e.pipelineUrl,
            jobs: jobs.map((job) => `${job.name}: ${job.url}`),
          });
          inflight.delete(pipelineId);
          console.log(
            `  ${passed ? '✓' : '✗'} ${e.town}: ${state.status} ` +
              `(${results.length}/${total} done, ${inflight.size} running, ` +
              `${queue.length} waiting)`
          );
        }
      } catch (error) {
        console.error(`  ? poll error for ${e.town} (will retry): ${error}`);
      }
      await sleep(POLL_SPACING_MS);
    }

    // If we can't trigger more right now (window full, or queue drained but
    // pipelines still running), wait before polling again.
    if (
      inflight.size > 0 &&
      (queue.length === 0 || inflight.size >= maxInflight)
    ) {
      await sleep(POLL_ROUND_INTERVAL_MS);
    }
  }

  return { results, failedTowns };
}

function formatSummary(results: readonly TownResult[]): string {
  const sorted = [...results].sort((a, b) => a.town.localeCompare(b.town));
  const lines = sorted.map(
    (r) =>
      `${r.passed ? 'PASS' : 'FAIL'}  ${r.town.padEnd(28)} ${r.pipelineUrl}`
  );
  const failed = sorted.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push('', 'Failed job links (reports saved to <town>/qa-report/):');
    for (const r of failed) {
      lines.push(`  ${r.town}`);
      for (const job of r.jobs) {
        lines.push(`    ${job}`);
      }
    }
  }
  const passCount = sorted.length - failed.length;
  lines.push(
    '',
    `${passCount}/${sorted.length} passed, ${failed.length} failed`
  );
  return lines.join('\n');
}

const USAGE = `Usage: trigger_nh_qa_batch <out-dir> [--slug <gh/org/repo>] [--max-inflight <n>] [--trigger-delay-ms <ms>]

Triggers the vx-qa pipeline for every town package under <out-dir> (the output
of render_nh_election_package: <out-dir>/<Town>/election-package-*.zip), polling
to completion. Writes <out-dir>/qa-summary.txt and qa-results.json, and saves
failing towns' run.log/report.html to <out-dir>/<Town>/qa-report/.

  --max-inflight <n>   Cap the number of pipelines running at once (default:
                       unbounded -- enqueue all and let CircleCI's queue limit
                       concurrency). Use this to avoid saturating shared CI.
  --trigger-delay-ms   Delay between trigger API calls (default ${TRIGGER_DELAY_MS}).

Env: AWS_S3_BUCKET_NAME, AWS_S3_REGION, AWS credentials, CIRCLECI_API_TOKEN.`;

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    console.error(USAGE);
    return 1;
  }

  const token = process.env.CIRCLECI_API_TOKEN;
  if (!token) {
    console.error('CIRCLECI_API_TOKEN must be set (VxQA Admin API token).');
    return 1;
  }

  const packages = discoverPackages(args.outDir);
  if (packages.length === 0) {
    console.error(`No election packages found under ${args.outDir}`);
    return 1;
  }
  const cap = Number.isFinite(args.maxInflight)
    ? `${args.maxInflight} at a time`
    : 'all at once';
  console.log(`QA-ing ${packages.length} town package(s) (${cap})...\n`);

  const { results: polled, failedTowns } = await runBatch(
    packages,
    token,
    args.projectSlug,
    args.triggerDelayMs,
    args.maxInflight
  );

  const results: TownResult[] = [
    ...polled,
    ...failedTowns.map((town) => ({
      town,
      status: 'enqueue-failed',
      passed: false,
      pipelineUrl: '(not triggered)',
      jobs: [],
    })),
  ];

  const summary = formatSummary(results);
  console.log(`\n${summary}`);
  await writeFile(join(args.outDir, 'qa-summary.txt'), `${summary}\n`);
  await writeFile(
    join(args.outDir, 'qa-results.json'),
    `${JSON.stringify(results, null, 2)}\n`
  );

  return results.every((r) => r.passed) ? 0 : 1;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
