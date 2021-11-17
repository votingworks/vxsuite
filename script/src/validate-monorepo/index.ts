import { dirname, join, relative } from 'path';
import { IO } from '../types';
import {
  checkTsconfig,
  checkTsconfigReferences,
  maybeReadPackageJson,
  maybeReadTsconfig,
  readdir,
  ValidationIssueKind,
} from './validation';

/**
 * Validate the monorepo build configuration, printing any issues found.
 */
export async function main({ stdout, stderr }: IO): Promise<number> {
  const cwd = process.cwd();
  let packageCount = 0;
  let tsconfigCount = 0;
  let tsconfigBuildCount = 0;
  let errors = 0;
  const apps = await readdir(join(__dirname, '../../../apps'));
  const libs = await readdir(join(__dirname, '../../../libs'));

  for (const pkg of [...apps, ...libs]) {
    const packageJsonPath = join(pkg, 'package.json');
    const packageJson = await maybeReadPackageJson(packageJsonPath);

    if (!packageJson) {
      continue;
    }

    packageCount += 1;

    const workspaceDependencies = (
      packageJson.dependencies ? Object.entries(packageJson.dependencies) : []
    ).flatMap(([name, version]) =>
      version.startsWith('workspace:') ? [name] : []
    );

    const tsconfigPath = join(pkg, 'tsconfig.json');
    const tsconfig = await maybeReadTsconfig(tsconfigPath);

    if (!tsconfig) {
      stderr.write(`${tsconfigPath}: missing TypeScript configuration\n`);
      errors += 1;
      continue;
    }

    tsconfigCount += 1;

    for (const error of checkTsconfig(tsconfig, tsconfigPath)) {
      stderr.write(`${tsconfigPath}: ${error}\n`);
      errors += 1;
    }

    const tsconfigBuildPath = join(pkg, 'tsconfig.build.json');
    const tsconfigBuild = await maybeReadTsconfig(tsconfigBuildPath);

    if (tsconfigBuild) {
      tsconfigBuildCount += 1;

      for (const error of checkTsconfig(tsconfigBuild, tsconfigBuildPath)) {
        stderr.write(`${tsconfigBuildPath}: ${error}\n`);
        errors += 1;
      }

      for (const issue of checkTsconfigReferences(
        tsconfig,
        tsconfigPath,
        tsconfigBuild,
        tsconfigBuildPath,
        workspaceDependencies,
        packageJsonPath
      )) {
        switch (issue.kind) {
          case ValidationIssueKind.TsconfigInvalidPropertyValue:
            stderr.write(
              `${relative(cwd, issue.tsconfigPath)}: invalid value for "${
                issue.propertyKeyPath
              }": ${issue.actualValue} (expected ${issue.expectedValue})\n`
            );
            break;

          case ValidationIssueKind.TsconfigMissingReference:
            stderr.write(
              `${relative(
                cwd,
                issue.tsconfigPath
              )}: missing expected reference to ${relative(
                cwd,
                issue.expectedReferencePath
              )} (from ${relative(cwd, issue.referencingPath)})\n`
            );
            break;

          default:
            throw new Error(`unexpected issue: ${JSON.stringify(issue)}`);
        }
        errors += 1;
      }
    }
  }

  stdout.write(
    `${packageCount} package.json, ${tsconfigCount} tsconfig.json, ${tsconfigBuildCount} tsconfig.build.json, ${errors} error(s)`
  );
  return errors === 0 ? 0 : 1;
}
