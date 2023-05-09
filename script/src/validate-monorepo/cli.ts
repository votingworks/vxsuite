import { throwIllegalValue } from '@votingworks/basics';
import { relative } from 'path';
import { IO } from '../types';
import { validateMonorepo, ValidationIssue } from './validation';
import * as circleci from './validation/circleci';
import * as pkgs from './validation/packages';
import * as tsconfig from './validation/tsconfig';

/**
 * Validate the monorepo build configuration, printing any issues found.
 */
export async function main({ stderr }: IO): Promise<number> {
  const cwd = process.cwd();
  let errors = 0;

  function reportValidationIssue(issue: ValidationIssue) {
    switch (issue.kind) {
      case pkgs.ValidationIssueKind.MismatchedPackageVersion: {
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
          )}: missing expected workspace dependency on ${issue.dependencyName}\n`
        );
        break;

      case circleci.ValidationIssueKind.UnusedJobIssue:
        stderr.write(
          `${relative(cwd, issue.configPath)}: unused job "${issue.jobName}"\n`
        );
        break;

      case circleci.ValidationIssueKind.UntestedPackageIssue:
        stderr.write(
          `${relative(cwd, issue.configPath)}: untested package "${
            issue.packagePath
          }", job "${issue.expectedJobName}" was not found\n`
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
