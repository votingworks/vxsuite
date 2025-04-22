import toml from '@iarna/toml';
import { assert } from '@votingworks/basics';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { AppName, BaseLogEventDetails } from '../src';

export interface AppDetails {
  name: string;
}

export interface LogSourceDetails {
  source: string;
}

export interface EventTypeDetails {
  eventType: string;
  documentationMessage: string;
}

export interface EventDetails extends Omit<BaseLogEventDetails, 'eventId'> {
  // We haven't yet generated the final type for `eventId`, `LogEventId`.
  eventId: string;
}

export interface LoggingConfig {
  apps: Map<string, AppDetails>;
  logSources: Map<string, LogSourceDetails>;
  eventTypes: Map<string, EventTypeDetails>;
  events: Map<string, EventDetails>;
}

function isAppName(input: string): input is AppName {
  return (Object.values(AppName) as string[]).includes(input);
}

function parseEventDetails(untypedEntry: toml.AnyJson): EventDetails {
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
    'documentationMessage' in value &&
      typeof value.documentationMessage === 'string',
    `Log config entry ${value.eventId} is missing documentationMessage`
  );

  const entry: EventDetails = {
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

function parseEventTypeDetails(untypedEntry: toml.AnyJson): EventTypeDetails {
  const value = untypedEntry.valueOf();
  assert(typeof value === 'object');
  assert(
    'eventType' in value && typeof value.eventType === 'string',
    'Log config entry is missing eventType'
  );
  assert(
    'eventType' in value && typeof value.eventType === 'string',
    `Log config entry type ${value.eventType} is missing eventType`
  );
  assert(
    'documentationMessage' in value &&
      typeof value.documentationMessage === 'string',
    `Log config entry type ${value.eventType} is missing documentationMessage`
  );

  return {
    eventType: value.eventType,
    documentationMessage: value.documentationMessage,
  };
}

function parseAppDetails(untypedEntry: toml.AnyJson): AppDetails {
  const value = untypedEntry.valueOf();
  assert(typeof value === 'object');
  assert(
    'name' in value && typeof value.name === 'string',
    'App is missing "name"'
  );
  return {
    name: value.name,
  };
}

function parseLogSourceDetails(untypedEntry: toml.AnyJson): LogSourceDetails {
  const value = untypedEntry.valueOf();
  assert(typeof value === 'object');
  assert(
    'source' in value && typeof value.source === 'string',
    'Log source is missing "source"'
  );
  return {
    source: value.source,
  };
}

export function parseConfig(tomlConfig: toml.JsonMap): LoggingConfig {
  const entries = tomlConfig;
  const {
    Apps: apps,
    LogSources: logSources,
    EventTypes: eventTypes,
    Events: events,
  } = entries;
  assert(typeof apps === 'object');
  assert(typeof logSources === 'object');
  assert(typeof eventTypes === 'object');
  assert(typeof events === 'object');
  return {
    apps: new Map(
      Object.entries(apps).map(
        ([name, untypedEntry]) => [name, parseAppDetails(untypedEntry)] as const
      )
    ),
    logSources: new Map(
      Object.entries(logSources).map(
        ([name, untypedEntry]) =>
          [name, parseLogSourceDetails(untypedEntry)] as const
      )
    ),
    eventTypes: new Map(
      Object.entries(eventTypes).map(
        ([name, untypedEntry]) =>
          [name, parseEventTypeDetails(untypedEntry)] as const
      )
    ),
    events: new Map(
      Object.entries(events).map(
        ([name, untypedEntry]) =>
          [name, parseEventDetails(untypedEntry)] as const
      )
    ),
  };
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
  return new Promise((resolve, reject) => {
    execFile('diff', [tempFile, existingFile], (error, stdout) => {
      // An error with code 1 is expected when a diff exists
      fs.rmSync(tempFile);
      if (error) {
        reject(
          new Error(
            error.code === 1
              ? `Diff found between generated types and existing types on disk. Did you run pnpm build:generate-types and commit the output?\n${stdout}`
              : `Unexpected error when running diff: ${error}`
          )
        );
      } else {
        resolve();
      }
    });
  });
}
