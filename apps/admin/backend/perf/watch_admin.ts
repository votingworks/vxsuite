import { spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { ADMIN_WORKSPACE_DATABASE_NAME } from '../build/util/workspace.js';
import { type RunConfig, summarizeRun } from './summary.ts';

const PERF_DIR = import.meta.dirname;

function findAdminBackendPid(): number | undefined {
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const args = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0');
      const cwd = readlinkSync(`/proc/${name}/cwd`);
      if (
        /(^|\/)node$/.test(args[0] ?? '') &&
        args.some((arg) => arg.endsWith('build/index.js')) &&
        cwd.endsWith('apps/admin/backend')
      ) {
        return Number(name);
      }
    } catch {
      // The process exited or belongs to another user.
    }
  }
  return undefined;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      pid: { type: 'string' },
      workspace: { type: 'string' },
      label: { type: 'string', default: 'ui-finalize' },
      out: { type: 'string', default: join(PERF_DIR, 'results') },
    },
  });
  const pid = values.pid ? Number(values.pid) : findAdminBackendPid();
  if (!pid) {
    throw new Error('Could not find the admin backend process; pass --pid');
  }
  const workspacePath = resolve(
    values.workspace ??
      process.env['ADMIN_WORKSPACE'] ??
      join(PERF_DIR, '../dev-workspace')
  );
  const db = Client.fileClient(
    join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME),
    new BaseLogger(LogSource.VxAdminService)
  );

  const startedAtMs = Date.now();
  const runDir = resolve(
    values.out,
    `${new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19)}-${values.label}`
  );
  mkdirSync(runDir, { recursive: true });
  const config: RunConfig & Record<string, unknown> = {
    label: values.label,
    election: 'admin-ui',
    pool: 4,
    modes: [],
    stats: { ballotStyles: 0, precincts: 0, contests: 0, candidates: 0 },
    expectedPdfs: 0,
    startedAtMs,
    pid,
    workspacePath,
  };
  writeFileSync(join(runDir, 'config.json'), JSON.stringify(config, null, 2));

  const sampler = spawn(
    process.execPath,
    [
      join(PERF_DIR, 'sampler.ts'),
      '--pid',
      String(pid),
      '--out',
      runDir,
      '--watch-dir',
      join(workspacePath, 'election-packages'),
      '--fs-path',
      tmpdir(),
    ],
    { stdio: ['ignore', 'inherit', 'inherit'], detached: true }
  );
  const samplerExited = new Promise<void>((resolveExit) => {
    sampler.on('exit', () => resolveExit());
  });

  const progressCsv = createWriteStream(join(runDir, 'progress.csv'));
  progressCsv.write('t_ms,phase,progress,total,status\n');
  let lastStatus: string | undefined;
  const poll = setInterval(() => {
    const row = db.one(
      `select status, progress_label as label, progress, progress_total as total
       from design_election_packages order by started_at desc limit 1`
    ) as
      | {
          status: string;
          label: string | null;
          progress: number | null;
          total: number | null;
        }
      | undefined;
    if (!row) return;
    const phase =
      row.status === 'running'
        ? (row.label ?? 'setup')
        : row.status === 'succeeded'
          ? 'done'
          : row.status;
    progressCsv.write(
      `${[Date.now(), phase, row.progress ?? 0, row.total ?? 0, row.status].join(',')}\n`
    );
    if (row.status !== lastStatus) {
      console.log(
        `[perf] election package ${row.status} (${row.label ?? ''} ${row.progress ?? ''}/${row.total ?? ''})`
      );
      lastStatus = row.status;
    }
  }, 1000);

  console.log(
    `[perf] sampling admin backend pid ${pid} into ${runDir}. Click Finalize now; press Ctrl-C when the build finishes.`
  );
  process.on('SIGINT', () => {
    clearInterval(poll);
    progressCsv.end(() => {
      sampler.kill('SIGTERM');
      void samplerExited.then(() => {
        console.log(JSON.stringify(summarizeRun(runDir), null, 2));
        process.exit(0);
      });
    });
  });
}

main();
