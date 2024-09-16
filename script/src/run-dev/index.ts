import {
  concurrently,
  ConcurrentlyCommandInput,
  KillOthers,
  LogError,
  LogExit,
  Logger,
  LogOutput,
} from 'concurrently';
import * as fs from 'node:fs';
import { basename, join } from 'node:path';
import { Writable } from 'node:stream';

type CommandInfo = Exclude<ConcurrentlyCommandInput, string>;

interface IO {
  readonly stdout: Writable;
  readonly stderr: Writable;
}

/**
 * Determines whether a package builds with `tsc --build`.
 */
function isTscBuildPackage(cwd: string): boolean {
  return fs.existsSync(join(cwd, 'tsconfig.build.json'));
}

/**
 * Creates a `concurrently` command for running a binary from a package's
 * `node_modules/.bin` directory.
 */
function npmBinCommand({
  cwd = process.cwd(),
  env,
  ...rest
}: CommandInfo): CommandInfo {
  return {
    cwd,
    env: {
      ...process.env,
      ...(env ?? {}),
      PATH: `${join(cwd, 'node_modules', '.bin')}:${env?.['PATH'] ?? process.env['PATH']
        }`,
    },
    ...rest,
  };
}

/**
 * Creates a `concurrently` command for building a TypeScript package.
 */
function tscWatchBuild({
  cwd = process.cwd(),
  ...rest
}: Omit<CommandInfo, 'command'>): CommandInfo {
  const tsconfigPath = isTscBuildPackage(cwd)
    ? 'tsconfig.build.json'
    : 'tsconfig.json';
  return npmBinCommand({
    cwd,
    command: `tsc --build --watch --preserveWatchOutput ${tsconfigPath}`,
    prefixColor: 'blue',
    ...rest,
  });
}

/**
 * Runs the server and the other development commands concurrently.
 */
export async function main(
  argv: readonly string[],
  { stdout, stderr }: IO
): Promise<number> {
  const [, programName, ...args] = argv;
  const logger = new Logger({});

  let coreOnly = false;
  let frontend: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    switch (arg) {
      case '-h':
      case '--help':
        stdout.write(`Usage: ${programName} FRONTEND [--core-only]\n`);
        return 0;

      case '--core-only':
        coreOnly = true;
        break;

      default:
        if (arg.startsWith('-')) {
          stderr.write(`Unknown option: ${arg}\n`);
          return 1;
        }

        if (frontend) {
          stderr.write(`Only one frontend can be specified, got: ${arg}\n`);
          return 1;
        }

        frontend = arg;
        break;
    }
  }

  if (!frontend) {
    stderr.write('No frontend specified\n');
    return 1;
  }

  const monorepoRoot = join(__dirname, '../../..');
  let frontendRoot = join(monorepoRoot, 'apps', frontend, 'frontend');
  // Support our old file structure while we transition to the new apps/ structure.
  if (!fs.existsSync(frontendRoot)) {
    frontendRoot = join(monorepoRoot, 'frontends', frontend);
  }

  if (!fs.existsSync(frontendRoot)) {
    stderr.write(`Frontend not found: ${frontend}\n`);
    return 1;
  }

  // Always run the core commands.
  const commands: CommandInfo[] = [
    npmBinCommand({
      name: `${frontend}:server`,
      command: 'vite --clearScreen false',
      prefixColor: 'yellow',
      cwd: frontendRoot,
    }),
    tscWatchBuild({
      name: `${frontend}:build`,
      cwd: frontendRoot,
    }),
  ];

  // Optionally run all the dependent services.
  if (!coreOnly) {
    const frontendPackageJson = JSON.parse(
      fs.readFileSync(join(frontendRoot, 'package.json'), 'utf8')
    );
    const frontendVxConfig = frontendPackageJson['vx'] ?? {};
    const extraEnv = frontendVxConfig['env'] ?? {};

    if (frontendVxConfig.services) {
      for (const service of frontendVxConfig.services) {
        const serviceRoot = join(frontendRoot, service);
        const name = basename(service);

        if (isTscBuildPackage(serviceRoot)) {
          commands.push(
            // Rebuild any changes to the service or its dependencies.
            tscWatchBuild({
              name: `${name}:build`,
              cwd: serviceRoot,
              env: extraEnv,
            }),

            // Run the service with hot reloading.
            npmBinCommand({
              name: `${name}:run`,
              command:
                'while [ ! -f build/index.js ]; do echo "Waiting for build…"; sleep 1; done; ' +
                'nodemon --watch build --delay 1 --exitcrash --exec ' +
                'NODE_ENV=development pnpm start',
              prefixColor: 'cyan',
              cwd: serviceRoot,
              env: extraEnv,
            })
          );
        } else {
          stderr.write(`Cannot find build command for service: ${name}\n`);
          return 1;
        }
      }
    }
  }

  const running = concurrently(commands, {
    logger,
    cwd: join(__dirname, '..'),
    outputStream: stdout,
    controllers: [
      new LogOutput({ logger }),
      new LogError({ logger }),
      new LogExit({ logger }),
      new KillOthers({
        logger,
        conditions: ['failure', 'success'],
      }),
    ],
  });

  for (const closeEvent of await running.result) {
    if (typeof closeEvent.exitCode === 'number' && closeEvent.exitCode !== 0) {
      return closeEvent.exitCode;
    }
  }

  return 0;
}
