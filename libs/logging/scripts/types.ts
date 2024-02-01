import toml from '@iarna/toml';
import { assert } from '@votingworks/basics';
import { LogEventType } from '../src/base_types/log_event_types';
import { LogSource } from '../src/base_types/log_source';
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

function isLogSource(input: string): input is LogSource {
  return (Object.values(LogSource) as string[]).includes(input);
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
    'Log config entry is missing eventType'
  );
  assert(
    isLogEventType(value.eventType),
    `Unknown eventType ${value.eventType}`
  );
  assert(
    'documentationMessage' in value &&
      typeof value.documentationMessage === 'string',
    'Log config entry is missing documentationMessage'
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
        isLogSource(appName),
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
