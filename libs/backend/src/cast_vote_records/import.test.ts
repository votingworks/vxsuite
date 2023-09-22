import { CVR } from '@votingworks/types';

import { TEST_OTHER_REPORT_TYPE } from './build_report_metadata';
import { isTestReport } from './import';

test.each<{ report: CVR.CastVoteRecordReport; expectedResult: boolean }>([
  {
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      OtherReportType: TEST_OTHER_REPORT_TYPE,
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      ReportType: [
        CVR.ReportType.OriginatingDeviceExport,
        CVR.ReportType.Other,
      ],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
      vxBatch: [],
    },
    expectedResult: true,
  },
  {
    report: {
      '@type': 'CVR.CastVoteRecordReport',
      Election: [],
      GeneratedDate: new Date().toISOString(),
      GpUnit: [],
      ReportGeneratingDeviceIds: [],
      ReportingDevice: [],
      ReportType: [CVR.ReportType.OriginatingDeviceExport],
      Version: CVR.CastVoteRecordVersion.v1_0_0,
      vxBatch: [],
    },
    expectedResult: false,
  },
])('isTestReport', ({ report, expectedResult }) => {
  expect(isTestReport(report)).toEqual(expectedResult);
});
