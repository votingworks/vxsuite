import {
  type PnpmPackageInfo,
  generateAllCircleCiConfigs,
} from '@votingworks/monorepo-utils';
import { readFileSync } from 'node:fs';

/**
 * Any kind of validation issue with the CircleCI configuration.
 */
export type ValidationIssue = OutdatedConfig;

/**
 * CircleCI configuration is outdated.
 */
export interface OutdatedConfig {
  kind: 'OutdatedConfig';
  configPath: string;
}

/**
 * All the kinds of validation issues for CircleCI configuration.
 */
export type ValidationIssueKind = ValidationIssue['kind'];

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
        kind: 'OutdatedConfig',
        configPath: path,
      };
    }
  }
}
