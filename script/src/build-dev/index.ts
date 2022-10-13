import { spawnSync, StdioOptions } from 'child_process';
import * as fs from 'fs';
import { basename, join } from 'path';
import { Writable } from 'stream';

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
 * Returns the tsc build path, which have a base of 
 * tsconfig.build.json or tsconfig.json
 */
 function tscBuildPath(cwd: string): string {
  return join(cwd, isTscBuildPackage(cwd) ? 'tsconfig.build.json' : 'tsconfig.json');
}

/**
 * Determines whether a package runs with Python.
 */
function isPythonPackage(cwd: string): boolean {
  return fs.existsSync(join(cwd, 'Pipfile'));
}

/**
 * Creates a command for running a binary from a package's
 * `node_modules/.bin` directory.
 */
function npmBinCommandFile(cwd: string, command: string): string {
 return join(cwd, 'node_modules', '.bin', command)
}

/**
 * Spawns process to build a package's typescript dependencies
 */
function buildTscDependencies(cwd: string, stdio: StdioOptions) {
  spawnSync(
    npmBinCommandFile(cwd, 'tsc'), 
    ['--build', tscBuildPath(cwd), '--pretty'], 
    { stdio }
  );
}

/**
 * Builds the frontend, related services, and dependencies
 */
export function main(
  argv: readonly string[],
  { stdout, stderr }: IO
): number {
  const [, programName, ...args] = argv;
  const stdio: StdioOptions = [null, stdout, stderr];

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
  const frontendRoot = join(monorepoRoot, 'frontends', frontend);

  if (!fs.existsSync(frontendRoot)) {
    stderr.write(`Frontend not found: ${frontend}\n`);
    return 1;
  }

  // Always build the frontend
  stdout.write('> building frontend dependencies...\n');
  buildTscDependencies(frontendRoot, stdio);
  stdout.write('> building frontend: ');
  spawnSync(
    npmBinCommandFile(frontendRoot, 'vite'), 
    ['build', frontendRoot], 
    { stdio }
  );

  // Optionally run all the dependent services
  if (!coreOnly) {
    const frontendPackageJson = JSON.parse(
      fs.readFileSync(join(frontendRoot, 'package.json'), 'utf8')
    );
    const frontendVxConfig = frontendPackageJson['vx'] ?? {};

    if (frontendVxConfig.services) {
      for (const service of frontendVxConfig.services) {
        const serviceRoot = join(frontendRoot, service);
        const name = basename(service);
        stdout.write('\n');
        if (isTscBuildPackage(serviceRoot)) {
          stdout.write(`> building ${name} service dependencies...\n`);
          buildTscDependencies(serviceRoot, stdio);
          stdout.write(`> building ${name} service...\n`);
          spawnSync(
            npmBinCommandFile(frontendRoot, 'pnpm'), 
            ['build'], 
            { stdio }
          );
        } else if (isPythonPackage(serviceRoot)) {
          stdout.write(`> building ${name} service...\n`);
          spawnSync(
            'make', 
            ['build', '-C', serviceRoot], 
            { stdio }
          );
        } else {
          stderr.write(`Cannot find build command for service: ${name}\n`);
          return 1;
        }
      }
    }
    stdout.write('> all dependent services built\n');
  }  

  return 0;
}
