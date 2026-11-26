import { throwIllegalValue } from '@votingworks/basics';
import { relative } from 'node:path';
import type { IO } from '../types.ts';
import { validateMonorepo, type ValidationIssue } from './validation/index.ts';

/**
 * Validate the monorepo build configuration, printing any issues found.
 */
export async function main({ stderr }: IO): Promise<number> {
  const cwd = process.cwd();
  let errors = 0;

  function reportValidationIssue(issue: ValidationIssue) {
    switch (issue.kind) {
      case 'MismatchedPropertyValue': {
        const { properties } = issue;
        stderr.write(`Mismatched package configuration:\n`);
        for (const { packageJsonPath, propertyName, value } of properties) {
          stderr.write(
            `  ${relative(cwd, packageJsonPath)}: ${propertyName} ${
              typeof value === 'undefined' ? 'is unset' : `= ${value}`
            }\n`
          );
        }
        errors += 1;
        break;
      }

      case 'NoLicenseSpecified': {
        const { packageJsonPath } = issue;
        stderr.write(
          `${relative(
            cwd,
            packageJsonPath
          )}: "license" must be "GPL-3.0-only"\n`
        );

        errors += 1;
        break;
      }

      case 'UnexportedPackageJson': {
        const { packageJsonPath } = issue;
        stderr.write(
          `${relative(
            cwd,
            packageJsonPath
          )}: "exports" must include "./package.json" so tooling can read it\n`
        );
        errors += 1;
        break;
      }

      case 'InvalidTaskDelegation': {
        const { packageJsonPath, task, expected, actual } = issue;
        stderr.write(
          `${relative(
            cwd,
            packageJsonPath
          )}: "${task}" must delegate to the vx-task orchestrator. Expected ${JSON.stringify(
            expected
          )}, got ${
            actual === undefined ? '(missing)' : JSON.stringify(actual)
          }\n`
        );
        errors += 1;
        break;
      }

      case 'DevOnlyProductionDependency': {
        const { packageJsonPath, dependencyName } = issue;
        stderr.write(
          `${relative(
            cwd,
            packageJsonPath
          )}: ${dependencyName} must be in "devDependencies" of packages that ship in production\n`
        );
        break;
      }

      case 'MissingConfigFile': {
        const { tsconfigPath } = issue;
        stderr.write(`${tsconfigPath}: missing TypeScript configuration\n`);
        errors += 1;
        break;
      }

      case 'InvalidPropertyValue':
        stderr.write(
          `${relative(cwd, issue.tsconfigPath)}: invalid value for "${
            issue.propertyKeyPath
          }": ${issue.actualValue} (expected ${issue.expectedValue})\n`
        );
        break;

      case 'MissingReference':
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

      case 'UnexpectedReference':
        stderr.write(
          `${relative(cwd, issue.tsconfigPath)}: unexpected reference to ${relative(
            cwd,
            issue.referencePath
          )} (not a workspace dependency in ${relative(
            cwd,
            issue.packageJsonPath
          )})\n`
        );
        break;

      case 'MissingWorkspaceDependency':
        stderr.write(
          `${relative(
            cwd,
            issue.packageJsonPath
          )}: missing expected workspace dependency on ${
            issue.dependencyName
          }\n`
        );
        break;

      case 'OutdatedConfig':
        stderr.write(
          `${relative(
            cwd,
            issue.configPath
          )}: configuration is outdated. To resolve, run pnpm -w generate-circleci-config and commit the results.\n`
        );
        break;

      case 'MismatchedCargoDependencyVersion':
        stderr.write(
          `Mismatched Cargo dependency versions for "${issue.dependencyName}":\n`
        );
        for (const prop of issue.properties) {
          stderr.write(
            `  ${prop.cargoTomlPath}: ${prop.section}.${prop.name} = ${prop.version}\n`
          );
        }
        break;

      case 'UntrackedCargoPathDependency':
        stderr.write(
          `${issue.packageDir}: Cargo path dependency "${issue.cargoPathDep}" is not tracked by turbo. Add it to build:self inputs in ${issue.packageDir}/turbo.json, e.g. "inputs": ["$TURBO_DEFAULT$", "${issue.suggestedInput}"]\n`
        );
        break;

      case 'UntrackedCargoWorkspaceFile':
        stderr.write(
          `${issue.packageDir}: Cargo workspace file "${issue.workspaceFile}" is not tracked by turbo. Add it to build:self inputs in ${issue.packageDir}/turbo.json, e.g. "inputs": ["$TURBO_DEFAULT$", "${issue.suggestedInput}"]\n`
        );
        break;

      case 'DirectCargoBuild':
        stderr.write(
          `${issue.packageDir}: "${issue.script}" must build Rust with "pnpm -w vx-cargo-build [cargo args]" instead of "cargo build", so the binaries are copied into build/ to run from there and be restored on a turbo cache hit\n`
        );
        break;

      case 'MissingTurboDefaultInput':
        stderr.write(
          `${issue.packageDir}/turbo.json: build:self "inputs" must include "$TURBO_DEFAULT$", or turbo won't hash the package's own files\n`
        );
        break;

      case 'MissingBuildOutput':
        stderr.write(
          `${issue.packageDir}/turbo.json: build:self "outputs" must include "build/**", where vx-cargo-build copies the binaries, or a turbo cache hit won't restore them\n`
        );
        break;

      case 'BrokenLink':
        stderr.write(
          `${relative(cwd, issue.markdownPath)}:${issue.line}: broken link to ${
            issue.link
          }\n`
        );
        break;

      default:
        throwIllegalValue(issue);
    }
  }

  for await (const issue of validateMonorepo()) {
    reportValidationIssue(issue);
    errors += 1;
  }

  return errors > 0 ? 1 : 0;
}
