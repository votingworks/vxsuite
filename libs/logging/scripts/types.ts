import toml from '@iarna/toml';
import { assert } from '@votingworks/basics';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { LogEventType } from '../src/base_types/log_event_types';
import { AppName } from '../src/base_types/log_source';
import { BaseLogEventDetails } from '../src';

export interface ParsedLogDetails extends Omit<BaseLogEventDetails, 'eventId'> {
  // We haven't yet generated the final type for `eventId`, `LogEventId`.
  eventId: string;
}

export interface ParsedConfig {
  [titleCaseLogId: string]: ParsedLogDetails;
}

function isLogEventType(input: string): input is LogEventType {
  return (Object.values(LogEventType) as string[]).includes(input);
}

function isAppName(input: string): input is AppName {
  return (Object.values(AppName) as string[]).includes(input);
}

function getTypedEntry(untypedEntry: toml.AnyJson): ParsedLogDetails {
  const value = untypedEntry.valueOf();
  assert(typeof value === 'object');
  assert(
    'eventId' in value && typeof value.eventId === 'string',
    'Log config entry is missing eventId'
  );
  assert(
    'eventType' in value && typeof value.eventType === 'string',
    `Log config entry ${value.eventId} is missing eventType`
  );
  assert(
    isLogEventType(value.eventType),
    `Unknown eventType ${value.eventType} in log config centry ${value.eventId}`
  );
  assert(
    'documentationMessage' in value &&
      typeof value.documentationMessage === 'string',
    `Log config entry ${value.eventId} is missing documentationMessage`
  );

  const entry: ParsedLogDetails = {
    eventId: value.eventId,
    eventType: value.eventType,
    documentationMessage: value.documentationMessage,
  };

  if ('defaultMessage' in value) {
    assert(
      typeof value.defaultMessage === 'string',
      `Unexpected typeof ${typeof value.defaultMessage} for defaultMessage`
    );
    entry.defaultMessage = value.defaultMessage;
  }

  if ('restrictInDocumentationToApps' in value) {
    assert(
      value.restrictInDocumentationToApps !== null &&
        Array.isArray(value.restrictInDocumentationToApps)
    );
    for (const appName of value.restrictInDocumentationToApps) {
      assert(
        typeof appName === 'string',
        `Unexpected typeof ${typeof appName} for entry in restrictInDocumentationToApps`
      );
      assert(
        isAppName(appName),
        `Unknown log event source ${appName} for entry in restrictInDocumentationToApps`
      );
    }
    entry.restrictInDocumentationToApps = value.restrictInDocumentationToApps;
  }

  return entry;
}

export function getTypedConfig(tomlConfig: toml.JsonMap): ParsedConfig {
  const entries = Object.entries(tomlConfig);
  const typedConfig: ParsedConfig = {};
  for (const [titleCaseEventId, untypedEntry] of entries) {
    typedConfig[titleCaseEventId] = getTypedEntry(untypedEntry);
  }
  return typedConfig;
}

export interface GenerateTypesArgs {
  check?: boolean;
}

export function diffAndCleanUp(
  tempFile: string,
  existingFile: string
): Promise<void> {
  // Use callback version of execFile because TypeScript infers error type.
  // try/catch with execFileSync or promisified execFile requires type narrowing
  return new Promise((resolve) => {
    execFile('diff', [tempFile, existingFile], (error, stdout) => {
      // An error with code 1 is expected when a diff exists
      fs.rmSync(tempFile);
      if (error) {
        if (error.code === 1) {
          throw new Error(
            `Diff found between generated types and existing types on disk. Did you run pnpm build:generate-types and commit the output?\n${stdout}`
          );
        }

        throw new Error(`Unexpected error when running diff: ${error}`);
      }

      resolve();
    });
  });
}
