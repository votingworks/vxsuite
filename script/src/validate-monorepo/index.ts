import { join, relative } from 'path';
import { IO } from '../types';
import {
  checkTsconfig,
  checkTsconfigMatchesPackageJson,
  checkTsconfigReferencesMatch,
  maybeReadPackageJson,
  maybeReadTsconfig,
  readdir,
  ValidationIssue,
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
  const services = await readdir(join(__dirname, '../../../services'));
  const frontends = await readdir(join(__dirname, '../../../frontends'));
  const libs = await readdir(join(__dirname, '../../../libs'));

  for (const pkg of [...services, ...frontends, ...libs]) {
    const packageJsonPath = join(pkg, 'package.json');
    const packageJson = await maybeReadPackageJson(packageJsonPath);

    if (!packageJson) {
      continue;
    }

    packageCount += 1;

    const workspaceDependencies = [
      ...(packageJson.dependencies
        ? Object.entries(packageJson.dependencies)
        : []),
      ...(packageJson.devDependencies
        ? Object.entries(packageJson.devDependencies)
        : []),
    ].flatMap(([name, version]) =>
      name !== packageJson.name && version.startsWith('workspace:')
        ? [name]
        : []
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

    for await (const issue of checkTsconfigMatchesPackageJson(
      tsconfig,
      tsconfigPath,
      workspaceDependencies,
      packageJsonPath
    )) {
      reportValidationIssue(issue);
    }

    const tsconfigBuildPath = join(pkg, 'tsconfig.build.json');
    const tsconfigBuild = await maybeReadTsconfig(tsconfigBuildPath);

    function reportValidationIssue(issue: ValidationIssue) {
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

    if (tsconfigBuild) {
      tsconfigBuildCount += 1;

      for (const error of checkTsconfig(tsconfigBuild, tsconfigBuildPath)) {
        stderr.write(`${tsconfigBuildPath}: ${error}\n`);
        errors += 1;
      }

      for await (const issue of checkTsconfigMatchesPackageJson(
        tsconfigBuild,
        tsconfigBuildPath,
        workspaceDependencies,
        packageJsonPath
      )) {
        reportValidationIssue(issue);
      }

      for (const issue of checkTsconfigReferencesMatch(
        tsconfig,
        tsconfigPath,
        tsconfigBuild,
        tsconfigBuildPath
      )) {
        reportValidationIssue(issue);
      }
    }
  }

  stdout.write(
    `${packageCount} package.json, ${tsconfigCount} tsconfig.json, ${tsconfigBuildCount} tsconfig.build.json, ${errors} error(s)\n`
  );
  return errors === 0 ? 0 : 1;
}
