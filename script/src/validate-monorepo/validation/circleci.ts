import {
  CIRCLECI_CONFIG_PATH,
  PnpmPackageInfo,
  generateAllCircleCiConfigs,
} from '@votingworks/monorepo-utils';
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
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  const expectedCircleCiConfigs = generateAllCircleCiConfigs(workspacePackages);
  for (const [path, expectedConfig] of expectedCircleCiConfigs) {
    const actualConfig = readFileSync(path, 'utf-8');

    if (expectedConfig !== actualConfig) {
      yield {
        kind: ValidationIssueKind.OutdatedConfig,
        configPath: path,
      };
    }
  }
}
