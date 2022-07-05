import { ElectionEventLogDocumentationSchema } from '@votingworks/cdf-types-election-event-logging';
import { safeParseJson } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import MockDate from 'mockdate';
import * as fs from 'fs';
import { LogEventId } from './log_event_ids';
import {
  generateCdfLogDocumentationFileContent,
  generateMarkdownDocumentationContent,
} from './log_documentation';
import { LogSource } from './log_source';

MockDate.set('2020-07-24T00:00:00.000Z');

describe('test cdf documentation generation', () => {
  test('builds expected documentation for VxAdminFrontend', () => {
    const cdfDocumentationContent = generateCdfLogDocumentationFileContent(
      LogSource.VxAdminFrontend,
      'VxAdmin 1.0',
      'VotingWorks'
    );
    const structuredDataResult = safeParseJson(
      cdfDocumentationContent,
      ElectionEventLogDocumentationSchema
    );
    const structuredData = structuredDataResult.unsafeUnwrap();
    expect(structuredData.DeviceManufacturer).toBe('VotingWorks');
    expect(structuredData.DeviceModel).toBe('VxAdmin 1.0');
    expect(structuredData.GeneratedDate).toBe('2020-07-24T00:00:00.000Z');
    expect(structuredData.EventTypeDescription).toHaveLength(5);
    expect(structuredData.EventIdDescription).toHaveLength(53);
    // Make sure VxAdminFrontend specific logs are included.
    expect(structuredData.EventIdDescription).toContainEqual(
      expect.objectContaining({
        Id: LogEventId.CvrImported,
      })
    );
    // Make sure a generic log to all apps is included
    expect(structuredData.EventIdDescription).toContainEqual(
      expect.objectContaining({
        Id: LogEventId.MachineBootInit,
      })
    );
    // Make sure VxCentralScanFrontend specific logs are NOT included
    expect(structuredData.EventIdDescription).not.toContainEqual(
      expect.objectContaining({
        Id: LogEventId.ScannerConfigured,
      })
    );
  });

  test('builds expected documentation for VxCentralScanFrontend', () => {
    const cdfDocumentationContent = generateCdfLogDocumentationFileContent(
      LogSource.VxCentralScanFrontend,
      'VxCentralScan',
      'V oting Works'
    );
    const structuredDataResult = safeParseJson(
      cdfDocumentationContent,
      ElectionEventLogDocumentationSchema
    );
    expect(structuredDataResult.isOk()).toBeTruthy();
    const structuredData = structuredDataResult.ok();
    assert(structuredData);
    expect(structuredData.DeviceManufacturer).toBe('V oting Works');
    expect(structuredData.DeviceModel).toBe('VxCentralScan');
    expect(structuredData.GeneratedDate).toBe('2020-07-24T00:00:00.000Z');
    expect(structuredData.EventTypeDescription).toHaveLength(5);
    expect(structuredData.EventIdDescription).toHaveLength(57);
    // Make sure VxCentralScanApp specific logs are included.
    expect(structuredData.EventIdDescription).toContainEqual(
      expect.objectContaining({
        Id: LogEventId.ScannerConfigured,
      })
    );
    // Make sure a generic log to all apps is included
    expect(structuredData.EventIdDescription).toContainEqual(
      expect.objectContaining({
        Id: LogEventId.MachineBootInit,
      })
    );
    // Make sure VxAdminFrontend specific logs are NOT included
    expect(structuredData.EventIdDescription).not.toContainEqual(
      expect.objectContaining({
        Id: LogEventId.CvrImported,
      })
    );
  });
});

describe('test markdown documentation generation', () => {
  test('generated documentation is up to date you need to run `pnpx esr --cache scripts/generate_documentation.ts` if this fails', () => {
    const generatedFileContent = generateMarkdownDocumentationContent();
    const currentDocumentationContent = fs.readFileSync(
      'VotingWorksLoggingDocumentation.md'
    );
    expect(generatedFileContent).toEqual(
      currentDocumentationContent.toString()
    );
  });
});
