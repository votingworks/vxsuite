import { relative } from 'path';
import { IO } from '../types';
import { validateMonorepo, ValidationIssue } from './validation';
import * as circleci from './validation/circleci';
import * as tsconfig from './validation/tsconfig';
import { assertNever } from './validation/util';

/**
 * Validate the monorepo build configuration, printing any issues found.
 */
export async function main({ stderr }: IO): Promise<number> {
  const cwd = process.cwd();

  function reportValidationIssue(issue: ValidationIssue) {
    switch (issue.kind) {
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
        assertNever(issue);
    }
  }

  let errors = 0;

  for await (const issue of validateMonorepo()) {
    reportValidationIssue(issue);
    errors += 1;
  }

  return errors > 0 ? 1 : 0;
}
