import { CIRCLECI_CONFIG_PATH, PnpmPackageInfo, generateCircleCiConfig } from '@votingworks/monorepo-utils';
import { readFileSync } from 'node:fs';

/**
 * Any kind of validation issue with the CircleCI configuration.
 */
export type ValidationIssue = OutdatedConfig;

/**
 * All the kinds of validation issues for CircleCI configuration.
 */
export enum ValidationIssueKind {
  OutdatedConfig = 'OutdatedConfig',
}

/**
 * CircleCI configuration is outdated.
 */
export interface OutdatedConfig {
  kind: ValidationIssueKind.OutdatedConfig;
  configPath: string;
}

/**
 * Validates the CircleCI configuration.
 */
export function* checkConfig(
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>,
  rustPackageIds: string[],
): Generator<ValidationIssue> {
  const expectedCircleCiConfig = generateCircleCiConfig(workspacePackages, rustPackageIds)
  const actualConfig = readFileSync(CIRCLECI_CONFIG_PATH, 'utf-8');

  if (expectedCircleCiConfig !== actualConfig) {
    yield {
      kind: ValidationIssueKind.OutdatedConfig,
      configPath: CIRCLECI_CONFIG_PATH,
    };
  }
}
