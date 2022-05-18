import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';

/**
 * Any kind of validation issue with the CircleCI configuration.
 */
export type ValidationIssue = UnusedJobIssue | UntestedPackageIssue;

/**
 * All the kinds of validation issues for CircleCI configuration.
 */
export enum ValidationIssueKind {
  UnusedJobIssue = 'UnusedJobIssue',
  UntestedPackageIssue = 'UntestedPackageIssue',
}

/**
 * CircleCI job is unused.
 */
export interface UnusedJobIssue {
  kind: ValidationIssueKind.UnusedJobIssue;
  configPath: string;
  jobName: string;
}

/**
 * CircleCI config has no tests for a package.
 */
export interface UntestedPackageIssue {
  kind: ValidationIssueKind.UntestedPackageIssue;
  configPath: string;
  packagePath: string;
  expectedJobName: string;
}

/**
 * CircleCI configuration.
 */
export interface Config {
  version: string;
  jobs: Record<string, Job>;
  workflows: Record<string, Workflow>;
}

/**
 * CircleCI job. We don't actually need to know anything about the job for now,
 * so we just ignore its real data type.
 */
export type Job = unknown;

/**
 * CircleCI workflow.
 */
export interface Workflow {
  jobs: string[];
}

/**
 * Loads a CircleCI configuration from a file.
 */
export async function loadConfig(configPath: string): Promise<Config> {
  const configData = await readFile(configPath, {
    encoding: 'utf-8',
  });

  return parseYaml(configData);
}

/**
 * Validates the CircleCI configuration.
 */
export function* checkConfig(
  config: Config,
  configPath: string,
  workspacePaths: readonly string[]
): Generator<ValidationIssue> {
  const unusedJobs = new Set(Object.keys(config.jobs));

  for (const workflow of Object.values(config.workflows)) {
    for (const jobName of workflow.jobs) {
      unusedJobs.delete(jobName);
    }
  }

  for (const unusedJob of unusedJobs) {
    yield {
      kind: ValidationIssueKind.UnusedJobIssue,
      configPath,
      jobName: unusedJob,
    };
  }

  for (const workspacePath of workspacePaths) {
    const match = workspacePath.match(/([^/]+)\/(.+)/);
    if (match === null) {
      continue;
    }

    const [, packageType, packageName] = match;

    // exclude some packages that are intentionally not tested
    if (
      (packageType === 'libs' && packageName.startsWith('@types/')) ||
      packageName.endsWith('/prodserver')
    ) {
      continue;
    }

    const expectedJobName = packageName
      ? `test-${packageType}-${packageName}`
      : `test-${packageType}`;

    if (!(expectedJobName in config.jobs)) {
      yield {
        kind: ValidationIssueKind.UntestedPackageIssue,
        configPath,
        packagePath: workspacePath,
        expectedJobName,
      };
    }
  }
}
