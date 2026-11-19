import { execFileSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statfsSync,
  statSync,
  writeFileSync,
  type WriteStream,
} from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

interface ProcessStat {
  readonly ppid: number;
  readonly cpuTicks: number;
}

interface ProcessMemory {
  readonly rssKb: number;
  readonly pssKb: number;
  readonly pssAnonKb: number;
  readonly pssFileKb: number;
  readonly pssShmemKb: number;
  readonly swapPssKb: number;
}

interface TreeTotals {
  treeRss: number;
  treePss: number;
  nodeRss: number;
  nodePss: number;
  chromiumRss: number;
  chromiumPss: number;
  chromiumProcesses: number;
  nodeCpu: number;
  chromiumCpu: number;
}

const SYSTEM_COLUMNS = [
  't_ms',
  'mem_total_kb',
  'mem_available_kb',
  'mem_free_kb',
  'cached_kb',
  'swap_total_kb',
  'swap_used_kb',
  'cpu_busy_pct',
  'freq_avg_mhz',
  'freq_min_mhz',
  'freq_max_mhz',
  'temp_max_c',
  'package_throttle_count',
  'fs_used_delta_bytes',
  'watched_bytes',
  'tree_rss_kb',
  'tree_pss_kb',
  'node_rss_kb',
  'node_pss_kb',
  'chromium_rss_kb',
  'chromium_pss_kb',
  'chromium_processes',
  'node_cpu_pct',
  'node_main_thread_cpu_pct',
  'chromium_cpu_pct',
] as const;

const PROCESS_COLUMNS = [
  't_ms',
  'pid',
  'role',
  'rss_kb',
  'pss_kb',
  'pss_anon_kb',
  'pss_file_kb',
  'pss_shmem_kb',
  'swap_pss_kb',
  'cpu_pct',
] as const;

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function clockTicksPerSecond(): number {
  try {
    return (
      Number(execFileSync('getconf', ['CLK_TCK']).toString().trim()) || 100
    );
  } catch {
    return 100;
  }
}

function parseStat(text?: string): ProcessStat | undefined {
  if (!text) return undefined;
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  return {
    ppid: Number(fields[1]),
    cpuTicks: Number(fields[11]) + Number(fields[12]),
  };
}

function listPids(): number[] {
  return readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map(Number);
}

function listDescendants(rootPid: number, excludePid: number): number[] {
  const children = new Map<number, number[]>();
  for (const pid of listPids()) {
    const stat = parseStat(readText(`/proc/${pid}/stat`));
    if (!stat) continue;
    const siblings = children.get(stat.ppid) ?? [];
    siblings.push(pid);
    children.set(stat.ppid, siblings);
  }
  const result: number[] = [];
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (pid === excludePid) continue;
    result.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return result;
}

function parseKbFields(text: string): Map<string, number> {
  const fields = new Map<string, number>();
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)/.exec(line);
    if (match?.[1] && match[2]) fields.set(match[1], Number(match[2]));
  }
  return fields;
}

function readProcessMemory(pid: number): ProcessMemory | undefined {
  const rollup = readText(`/proc/${pid}/smaps_rollup`);
  if (rollup) {
    const fields = parseKbFields(rollup);
    return {
      rssKb: fields.get('Rss') ?? 0,
      pssKb: fields.get('Pss') ?? 0,
      pssAnonKb: fields.get('Pss_Anon') ?? 0,
      pssFileKb: fields.get('Pss_File') ?? 0,
      pssShmemKb: fields.get('Pss_Shmem') ?? 0,
      swapPssKb: fields.get('SwapPss') ?? 0,
    };
  }
  const status = readText(`/proc/${pid}/status`);
  if (!status) return undefined;
  const rssKb = parseKbFields(status).get('VmRSS') ?? 0;
  return {
    rssKb,
    pssKb: rssKb,
    pssAnonKb: 0,
    pssFileKb: 0,
    pssShmemKb: 0,
    swapPssKb: 0,
  };
}

function processRole(pid: number, rootPid?: number): string {
  if (pid === rootPid) return 'node';
  const args = (readText(`/proc/${pid}/cmdline`) ?? '').split(/[\0 ]/);
  const typeArg = args.find((arg) => arg.startsWith('--type='));
  const program = basename(args[0] ?? '');
  if (typeArg) {
    const type = typeArg.slice('--type='.length);
    return `chromium-${type === 'gpu-process' ? 'gpu' : type}`;
  }
  if (/chrom|headless_shell/.test(program)) return 'chromium-browser';
  if (program === 'node') return 'node-worker';
  return `other-${program || 'unknown'}`;
}

function readCpuTimes(): { busy: number; total: number } {
  const line = (readText('/proc/stat') ?? '').split('\n')[0] ?? '';
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  const total = values.slice(0, 8).reduce((a, b) => a + b, 0);
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  return { busy: total - idle, total };
}

function readCpuFrequencies(): number[] {
  const cpuDir = '/sys/devices/system/cpu';
  return readdirSync(cpuDir)
    .filter((name) => /^cpu\d+$/.test(name))
    .map((name) => readText(join(cpuDir, name, 'cpufreq/scaling_cur_freq')))
    .filter((text): text is string => text !== undefined)
    .map((text) => Number(text.trim()) / 1000);
}

function readMaxTemperature(): number | undefined {
  const thermalDir = '/sys/class/thermal';
  if (!existsSync(thermalDir)) return undefined;
  const temps = readdirSync(thermalDir)
    .filter((name) => name.startsWith('thermal_zone'))
    .map((name) => readText(join(thermalDir, name, 'temp')))
    .filter((text): text is string => text !== undefined)
    .map((text) => Number(text.trim()) / 1000)
    .filter((temp) => temp > 0 && temp < 150);
  return temps.length > 0 ? Math.max(...temps) : undefined;
}

function readPackageThrottleCount(): number | undefined {
  const text = readText(
    '/sys/devices/system/cpu/cpu0/thermal_throttle/package_throttle_count'
  );
  return text === undefined ? undefined : Number(text.trim());
}

function directoryBytes(path: string): number {
  let total = 0;
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      total += directoryBytes(entryPath);
    } else {
      try {
        total += statSync(entryPath).size;
      } catch {
        // The pipeline deletes scratch files while we walk.
      }
    }
  }
  return total;
}

function filesystemUsedBytes(path: string): number {
  const stats = statfsSync(path);
  return (stats.blocks - stats.bfree) * stats.bsize;
}

function snapshotTopProcesses(limit: number): unknown[] {
  return listPids()
    .map((pid) => ({
      pid,
      command: (readText(`/proc/${pid}/cmdline`) ?? '')
        .split('\0')
        .join(' ')
        .trim()
        .slice(0, 160),
      memory: readProcessMemory(pid),
    }))
    .filter((p) => p.memory !== undefined && p.command !== '')
    .sort((a, b) => (b.memory?.pssKb ?? 0) - (a.memory?.pssKb ?? 0))
    .slice(0, limit);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      pid: { type: 'string' },
      out: { type: 'string' },
      'interval-ms': { type: 'string', default: '1000' },
      'disk-interval-ms': { type: 'string', default: '2000' },
      'duration-s': { type: 'string' },
      'watch-dir': { type: 'string', multiple: true, default: [] },
      'fs-path': { type: 'string' },
    },
  });
  if (!values.out) {
    throw new Error(
      'Usage: sampler.ts --out <dir> [--pid <pid>] [--duration-s <s>] [--watch-dir <dir>]...'
    );
  }
  const outDir = values.out;
  mkdirSync(outDir, { recursive: true });
  const rootPid = values.pid ? Number(values.pid) : undefined;
  const intervalMs = Number(values['interval-ms']);
  const diskIntervalMs = Number(values['disk-interval-ms']);
  const watchDirs = values['watch-dir'];
  const fsPath = values['fs-path'] ?? watchDirs[0] ?? '/tmp';
  const ticksPerSecond = clockTicksPerSecond();
  const startMs = Date.now();
  const fsUsedAtStart = filesystemUsedBytes(fsPath);

  writeFileSync(
    join(outDir, 'process_snapshot_start.json'),
    JSON.stringify(snapshotTopProcesses(25), null, 2)
  );

  const systemCsv: WriteStream = createWriteStream(join(outDir, 'system.csv'));
  systemCsv.write(`${SYSTEM_COLUMNS.join(',')}\n`);
  const processCsv: WriteStream | undefined = rootPid
    ? createWriteStream(join(outDir, 'processes.csv'))
    : undefined;
  processCsv?.write(`${PROCESS_COLUMNS.join(',')}\n`);

  const previousTicks = new Map<number, number>();
  let previousMainThreadTicks: number | undefined;
  let previousCpu = readCpuTimes();
  let previousSampleMs = Date.now();
  let watchedBytes = 0;
  let lastDiskSampleMs = 0;
  let stopped = false;

  function sample(): void {
    const now = Date.now();
    const elapsedS = Math.max(0.001, (now - previousSampleMs) / 1000);
    previousSampleMs = now;
    const meminfo = parseKbFields(readText('/proc/meminfo') ?? '');
    const cpu = readCpuTimes();
    const cpuBusyPct =
      cpu.total > previousCpu.total
        ? (100 * (cpu.busy - previousCpu.busy)) /
          (cpu.total - previousCpu.total)
        : 0;
    previousCpu = cpu;
    const freqs = readCpuFrequencies();

    if (now - lastDiskSampleMs >= diskIntervalMs) {
      watchedBytes = watchDirs.reduce(
        (sum, dir) => sum + directoryBytes(dir),
        0
      );
      lastDiskSampleMs = now;
    }

    const totals: TreeTotals = {
      treeRss: 0,
      treePss: 0,
      nodeRss: 0,
      nodePss: 0,
      chromiumRss: 0,
      chromiumPss: 0,
      chromiumProcesses: 0,
      nodeCpu: 0,
      chromiumCpu: 0,
    };
    let mainThreadCpuPct = 0;
    if (rootPid !== undefined) {
      for (const pid of listDescendants(rootPid, process.pid)) {
        const memory = readProcessMemory(pid);
        const stat = parseStat(readText(`/proc/${pid}/stat`));
        if (!memory || !stat) continue;
        const role = processRole(pid, rootPid);
        const prevTicks = previousTicks.get(pid);
        previousTicks.set(pid, stat.cpuTicks);
        const cpuPct =
          prevTicks === undefined
            ? 0
            : (100 * (stat.cpuTicks - prevTicks)) / ticksPerSecond / elapsedS;
        totals.treeRss += memory.rssKb;
        totals.treePss += memory.pssKb;
        if (role === 'node') {
          totals.nodeRss += memory.rssKb;
          totals.nodePss += memory.pssKb;
          totals.nodeCpu += cpuPct;
          const mainThread = parseStat(
            readText(`/proc/${pid}/task/${pid}/stat`)
          );
          if (mainThread) {
            if (previousMainThreadTicks !== undefined) {
              mainThreadCpuPct =
                (100 * (mainThread.cpuTicks - previousMainThreadTicks)) /
                ticksPerSecond /
                elapsedS;
            }
            previousMainThreadTicks = mainThread.cpuTicks;
          }
        } else if (role === 'node-worker') {
          totals.nodeRss += memory.rssKb;
          totals.nodePss += memory.pssKb;
          totals.nodeCpu += cpuPct;
        } else if (role.startsWith('chromium')) {
          totals.chromiumRss += memory.rssKb;
          totals.chromiumPss += memory.pssKb;
          totals.chromiumProcesses += 1;
          totals.chromiumCpu += cpuPct;
        }
        processCsv?.write(
          `${[
            now,
            pid,
            role,
            memory.rssKb,
            memory.pssKb,
            memory.pssAnonKb,
            memory.pssFileKb,
            memory.pssShmemKb,
            memory.swapPssKb,
            cpuPct.toFixed(1),
          ].join(',')}\n`
        );
      }
    }

    const swapTotal = meminfo.get('SwapTotal') ?? 0;
    const row = [
      now,
      meminfo.get('MemTotal') ?? '',
      meminfo.get('MemAvailable') ?? '',
      meminfo.get('MemFree') ?? '',
      meminfo.get('Cached') ?? '',
      swapTotal,
      swapTotal - (meminfo.get('SwapFree') ?? 0),
      cpuBusyPct.toFixed(1),
      freqs.length > 0
        ? (freqs.reduce((a, b) => a + b, 0) / freqs.length).toFixed(0)
        : '',
      freqs.length > 0 ? Math.min(...freqs).toFixed(0) : '',
      freqs.length > 0 ? Math.max(...freqs).toFixed(0) : '',
      readMaxTemperature()?.toFixed(1) ?? '',
      readPackageThrottleCount() ?? '',
      filesystemUsedBytes(fsPath) - fsUsedAtStart,
      watchedBytes,
      totals.treeRss,
      totals.treePss,
      totals.nodeRss,
      totals.nodePss,
      totals.chromiumRss,
      totals.chromiumPss,
      totals.chromiumProcesses,
      totals.nodeCpu.toFixed(1),
      mainThreadCpuPct.toFixed(1),
      totals.chromiumCpu.toFixed(1),
    ];
    systemCsv.write(`${row.join(',')}\n`);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    writeFileSync(
      join(outDir, 'process_snapshot_end.json'),
      JSON.stringify(snapshotTopProcesses(25), null, 2)
    );
    let pending = processCsv ? 2 : 1;
    function done() {
      pending -= 1;
      if (pending === 0) process.exit(0);
    }
    systemCsv.end(done);
    processCsv?.end(done);
  }

  function rootIsAlive(): boolean {
    return rootPid === undefined || existsSync(`/proc/${rootPid}`);
  }

  function tick(): void {
    if (stopped) return;
    if (!rootIsAlive()) {
      stop();
      return;
    }
    sample();
    const durationS = values['duration-s'];
    if (
      durationS !== undefined &&
      Date.now() - startMs >= Number(durationS) * 1000
    ) {
      stop();
      return;
    }
    const nextMs = intervalMs - ((Date.now() - startMs) % intervalMs);
    setTimeout(tick, nextMs);
  }

  process.on('SIGTERM', () => {
    if (!stopped) sample();
    stop();
  });
  process.on('SIGINT', () => {
    if (!stopped) sample();
    stop();
  });
  tick();
}

main();
