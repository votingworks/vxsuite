import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockWritable } from '../../../test/helpers/mock_writable';
import {
  Device,
  DeviceSchema,
  DeviceType,
  ElectionEventLog,
  ElectionEventLogDocumentation,
  ElectionEventLogDocumentationSchema,
  ElectionEventLogSchema,
  Event,
  EventDispositionType,
  EventIdDescription,
  EventSchema,
  EventTypeDescription,
  HashType,
} from '.';

const event: Event = {
  '@type': 'EventLogging.Event',
  Id: '1',
  Disposition: EventDispositionType.Success,
  Sequence: '1',
  TimeStamp: '2019-01-01T00:00:00.000Z',
  Type: 'test',
};

const device: Device = {
  '@type': 'EventLogging.Device',
  Id: '1',
  Event: [event],
  HashType: HashType.Sha256,
  Type: DeviceType.Bmd,
};

const electionEventLog: ElectionEventLog = {
  '@type': 'EventLogging.ElectionEventLog',
  Device: [device],
  GeneratedTime: '2019-01-01T00:00:00.000Z',
};

const eventIdDescription: EventIdDescription = {
  '@type': 'EventLogging.EventIdDescription',
  Id: '1',
  Description: 'test',
};

const eventTypeDescription: EventTypeDescription = {
  '@type': 'EventLogging.EventTypeDescription',
  Type: 'test',
  Description: 'test',
};

const electionEventLogDocumentation: ElectionEventLogDocumentation = {
  '@type': 'EventLogging.ElectionEventLogDocumentation',
  DeviceManufacturer: 'votingworks',
  DeviceModel: 'test',
  EventIdDescription: [eventIdDescription],
  EventTypeDescription: [eventTypeDescription],
  GeneratedDate: '2019-01-01T00:00:00.000Z',
};

test('Event', () => {
  EventSchema.parse(event);
});

test('Device', () => {
  DeviceSchema.parse(device);
});

test('ElectionEventLog', () => {
  ElectionEventLogSchema.parse(electionEventLog);
});

test('ElectionEventLogDocumentation', () => {
  ElectionEventLogDocumentationSchema.parse(electionEventLogDocumentation);
});

test('schema in sync', () => {
  const xsd = readFileSync(
    join(__dirname, '../../../data/cdf/election-event-logging/nist-schema.xsd'),
    'utf-8'
  );
  const json = readFileSync(
    join(
      __dirname,
      '../../../data/cdf/election-event-logging/nist-schema.json'
    ),
    'utf-8'
  );
  const currentOutput = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(xsd, json, out).unsafeUnwrap();
  const expectedOutput = out.toString();
  expect(currentOutput).toEqual(expectedOutput);
});
