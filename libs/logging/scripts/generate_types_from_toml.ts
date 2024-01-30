import toml from '@iarna/toml';
import fs from 'fs/promises';
import { assert } from '@votingworks/basics';
import {
  configFilepath,
  logEventIdsOutputFile,
  logEventIdsTemplateFile,
} from './filepaths';
import { LogEventType } from '../src/base_types/log_event_types';
import { LogSource } from '../src/base_types/log_source';
import { BaseLogEventDetails } from '../src';

interface ParsedLogDetails extends Omit<BaseLogEventDetails, 'eventId'> {
  // We haven't yet generated the final type for `eventId`, `LogEventId`.
  eventId: string;
}

interface ParsedConfig {
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

function getTypedConfig(tomlConfig: toml.JsonMap): ParsedConfig {
  const entries = Object.entries(tomlConfig);
  const typedConfig: ParsedConfig = {};
  for (const [titleCaseEventId, untypedEntry] of entries) {
    typedConfig[titleCaseEventId] = getTypedEntry(untypedEntry);
  }
  return typedConfig;
}

async function prepareOutputFile(): Promise<void> {
  await fs.copyFile(logEventIdsTemplateFile, logEventIdsOutputFile);
  await fs.appendFile(logEventIdsOutputFile, '\n');
}

// formatLogEventIdEnum generates an enum where the member name is a title-case event ID and the value is a kebab-case event ID
// eg.
// export enum LogEventId {
//   MyEventId = 'my-event-id',
// }
function formatLogEventIdEnum(config: ParsedConfig): string {
  const entries = Object.entries(config);
  let output = 'export enum LogEventId {\n';
  for (const [enumMember, logDetails] of entries) {
    output += `${enumMember} = '${logDetails.eventId}',\n`;
  }
  output += '}\n';
  return output;
}

// capitalize capitalizes the first character of a string and lower cases the remainder
function capitalize(input: string): string {
  if (input.length === 0) {
    return '';
  }
  if (input.length === 1) {
    return input.toUpperCase();
  }

  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

// kebabCaseToTitleCase expects an input in kebab-case and returns it in TitleCase
function kebabCaseToTitleCase(input: string): string {
  return input.split('-').map(capitalize).join('');
}

// formatSingleLogDetails generates TypeScript `LogDetails` for a single log eg.
// const ConfirmedBallot: LogDetails = {
//   eventId: 'ConfirmedBallot',
//   eventType: 'user-action',
//   documentationMessage: 'User confirmed the ballot is correct.',
// }
function formatSingleLogDetail(
  titleCaseEventId: string,
  singleConfig: ParsedLogDetails
): string {
  let output = `
    const ${titleCaseEventId}: LogDetails = {
      eventId: LogEventId.${titleCaseEventId},
      eventType: LogEventType.${kebabCaseToTitleCase(singleConfig.eventType)},
      documentationMessage: '${singleConfig.documentationMessage}',
  `;
  if (singleConfig.defaultMessage) {
    output += `defaultMessage: '${singleConfig.defaultMessage}',`;
  }
  if (singleConfig.restrictInDocumentationToApps) {
    output += `restrictInDocumentationToApps: [${singleConfig.restrictInDocumentationToApps.map(
      (logSource: string) => `LogSource.${kebabCaseToTitleCase(logSource)}`
    )}],
    `;
  }
  output += '};\n\n';
  return output;
}

// formatLogDetails generates TypeScript `LogDetails` for all logs in a config
// See `formatSingleLogDetail`
function formatLogDetails(config: ParsedConfig): string {
  const entries = Object.entries(config);
  let output = '';
  for (const [titleCaseEventId, details] of entries) {
    output += formatSingleLogDetail(titleCaseEventId, details);
  }

  return output;
}

// formatGetDetailsForEventId generates a function that returns a log's
// `LogDetails` object (ie. the object generated by `formatLogDetails`)
function formatGetDetailsForEventId(config: ParsedConfig): string {
  const keys = Object.keys(config);
  let output = `
    export function getDetailsForEventId(eventId: LogEventId): LogDetails {
      switch (eventId) {
  `;
  for (const key of keys) {
    output += `
      case LogEventId.${key}:
        return ${key};`;
  }

  output += `
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(eventId);
    }
  }`;

  return output;
}

async function main(): Promise<void> {
  await prepareOutputFile();

  const configString = await fs.readFile(configFilepath);
  const untypedConfig = toml.parse(configString.toString());
  const typedConfig = getTypedConfig(untypedConfig);
  await fs.appendFile(logEventIdsOutputFile, formatLogEventIdEnum(typedConfig));
  await fs.appendFile(logEventIdsOutputFile, formatLogDetails(typedConfig));
  await fs.appendFile(
    logEventIdsOutputFile,
    formatGetDetailsForEventId(typedConfig)
  );
}

void main();
