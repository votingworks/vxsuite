import { afterEach, beforeEach, expect, test } from 'vitest';
import { getRequiredEnvVar, isNodeEnvProduction } from './env_vars';

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  delete (process.env as { TEST_ENV_VAR?: string }).TEST_ENV_VAR;
});

afterEach(() => {
  delete (process.env as { TEST_ENV_VAR?: string }).TEST_ENV_VAR;
  process.env.NODE_ENV = originalNodeEnv;
});

test('getRequiredEnvVar returns the value when the env var is set', () => {
  (process.env as { TEST_ENV_VAR?: string }).TEST_ENV_VAR = 'hello';
  expect(getRequiredEnvVar('TEST_ENV_VAR' as 'NODE_ENV')).toEqual('hello');
});

test('getRequiredEnvVar throws when the env var is not set', () => {
  expect(() => getRequiredEnvVar('TEST_ENV_VAR' as 'NODE_ENV')).toThrow(
    'Missing required TEST_ENV_VAR env var'
  );
});

test('isNodeEnvProduction returns true when NODE_ENV is "production"', () => {
  process.env.NODE_ENV = 'production';
  expect(isNodeEnvProduction()).toEqual(true);
});

test('isNodeEnvProduction returns false when NODE_ENV is "development"', () => {
  process.env.NODE_ENV = 'development';
  expect(isNodeEnvProduction()).toEqual(false);
});

test('isNodeEnvProduction returns false when NODE_ENV is "test"', () => {
  process.env.NODE_ENV = 'test';
  expect(isNodeEnvProduction()).toEqual(false);
});

test('isNodeEnvProduction throws when NODE_ENV is unset', () => {
  delete (process.env as { NODE_ENV?: string }).NODE_ENV;
  expect(() => isNodeEnvProduction()).toThrow(
    'Missing required NODE_ENV env var'
  );
});

test('isNodeEnvProduction throws when NODE_ENV is not a valid value', () => {
  (process.env.NODE_ENV as string) = 'staging';
  expect(() => isNodeEnvProduction()).toThrow(
    'NODE_ENV should be one of development, production, test'
  );
});
