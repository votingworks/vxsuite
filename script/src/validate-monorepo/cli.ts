import { throwIllegalValue } from '@votingworks/basics';
import { relative } from 'node:path';
import { IO } from '../types';
import { validateMonorepo, ValidationIssue } from './validation';
import * as cargo from './validation/cargo';
import * as circleci from './validation/circleci';
import * as pkgs from './validation/packages';
import * as tsconfig from './validation/tsconfig';
import * as turbo from './validation/turbo';

/**
 * Validate the monorepo build configuration, printing any issues found.
 */
export async function main({ stderr }: IO): Promise<number> {
  const cwd = process.cwd();
  let errors = 0;

  function reportValidationIssue(issue: ValidationIssue) {
    switch (issue.kind) {
      case pkgs.ValidationIssueKind.MismatchedPropertyValue: {
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

      case pkgs.ValidationIssueKind.NoLicenseSpecified: {
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

      case pkgs.ValidationIssueKind.UnexportedPackageJson: {
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

      case pkgs.ValidationIssueKind.InvalidTaskDelegation: {
        const { packageJsonPath, task, expected, actual } = issue;
        stderr.write(
          `${relative(
            cwd,
            packageJsonPath
          )}: "${task}" must delegate to the vx-task orchestrator so build/lint/test run the same way in Turbo and pre-Turbo modes. Expected ${JSON.stringify(
            expected
          )}, got ${
            actual === undefined ? '(missing)' : JSON.stringify(actual)
          }\n`
        );
        errors += 1;
        break;
      }

      case tsconfig.ValidationIssueKind.MissingConfigFile: {
        const { tsconfigPath } = issue;
        stderr.write(`${tsconfigPath}: missing TypeScript configuration\n`);
        errors += 1;
        break;
      }

      case tsconfig.ValidationIssueKind.InvalidPropertyValue:
        stderr.write(
          `${relative(cwd, issue.tsconfigPath)}: invalid value for "${
            issue.propertyKeyPath
          }": ${issue.actualValue} (expected ${issue.expectedValue})\n`
        );
        break;

      case tsconfig.ValidationIssueKind.MissingReference:
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

      case tsconfig.ValidationIssueKind.MissingWorkspaceDependency:
        stderr.write(
          `${relative(
            cwd,
            issue.packageJsonPath
          )}: missing expected workspace dependency on ${
            issue.dependencyName
          }\n`
        );
        break;

      case circleci.ValidationIssueKind.OutdatedConfig:
        stderr.write(
          `${relative(
            cwd,
            issue.configPath
          )}: configuration is outdated. To resolve, run pnpm -w generate-circleci-config and commit the results.\n`
        );
        break;

      case cargo.ValidationIssueKind.MismatchedCargoDependencyVersion:
        stderr.write(
          `Mismatched Cargo dependency versions for "${issue.dependencyName}":\n`
        );
        for (const prop of issue.properties) {
          stderr.write(
            `  ${prop.cargoTomlPath}: ${prop.section}.${prop.name} = ${prop.version}\n`
          );
        }
        break;

      case turbo.ValidationIssueKind.UntrackedCargoPathDependency:
        stderr.write(
          `${issue.packageDir}: Cargo path dependency "${issue.cargoPathDep}" is not tracked by turbo. Add it to build:self inputs in ${issue.packageDir}/turbo.json, e.g. "inputs": ["$TURBO_DEFAULT$", "${issue.suggestedInput}"]\n`
        );
        break;

      case turbo.ValidationIssueKind.MissingCargoBinaryOutput:
        stderr.write(
          `${issue.packageDir}: Cargo binary "${issue.binaryName}" is not a turbo output. Add it to build:self outputs in ${issue.packageDir}/turbo.json, e.g. "outputs": ["build/**", "${issue.expectedOutput}"]\n`
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
