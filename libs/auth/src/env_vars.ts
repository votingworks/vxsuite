import { assert } from '@votingworks/basics';

/**
 * Gets an env var and throws an error if it's not set
 */
export function getRequiredEnvVar<T extends string>(
  envVarName: T
): NonNullable<NodeJS.ProcessEnv[T]> {
  const value = process.env[envVarName];
  assert(value !== undefined, `Missing required ${envVarName} env var`);
  // TS isn't recognizing that the above assertion guarantees that `value` is defined
  return value as NonNullable<NodeJS.ProcessEnv[T]>;
}

const VALID_NODE_ENVS = ['development', 'production', 'test'] as const;
type NODE_ENV = (typeof VALID_NODE_ENVS)[number];

function getNodeEnv(): NODE_ENV {
  const nodeEnv = getRequiredEnvVar('NODE_ENV');
  assert(
    VALID_NODE_ENVS.includes(nodeEnv),
    `NODE_ENV should be one of ${VALID_NODE_ENVS.join(', ')}`
  );
  return nodeEnv;
}

/**
 * Validates the NODE_ENV env var and returns whether it's been set to production
 */
export function isNodeEnvProduction(): boolean {
  return getNodeEnv() === 'production';
}
