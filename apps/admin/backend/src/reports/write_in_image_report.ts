import { assert, assertDefined } from '@votingworks/basics';
import { requireMountedUsbDrive } from '@votingworks/backend';
import {
  AdminContestWriteIns,
  AdminWriteInImageReport,
  CandidateGroupWriteIns,
  WriteInEntry,
} from '@votingworks/ui';
import { crop, loadImageData, toDataUrl } from '@votingworks/image-utils';
import { PdfError, Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageLayout,
  CandidateContest,
  ContestId,
  SheetOf,
} from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { Store } from '../store';
import { getCurrentTime } from '../util/get_current_time';
import { ExportDataResult, WriteInRecord } from '../types';
import { buildExporter } from '../util/exporter';
import { generateReportsDirectoryPath } from '../util/filenames';
import { rootDebug } from '../util/debug';

const debug = rootDebug.extend('write-in-image-report');

async function cropWriteInImage(
  imageBuffer: Buffer,
  layout: BallotPageLayout,
  contestId: string,
  optionId: string
): Promise<WriteInEntry | undefined> {
  const contestLayout = layout.contests.find(
    (c) =>
      c.contestId === contestId &&
      c.options.some((o) => o.definition?.id === optionId)
  );
  if (!contestLayout) {
    debug(
      'no contest layout found for contest %s option %s',
      contestId,
      optionId
    );
    return undefined;
  }
  const optionLayout = assertDefined(
    contestLayout.options.find((o) => o.definition?.id === optionId)
  );

  const imageResult = await loadImageData(imageBuffer);
  if (imageResult.isErr()) {
    debug('failed to load image: %O', imageResult.err());
    return undefined;
  }

  const cropped = crop(imageResult.ok(), optionLayout.bounds);
  return { type: 'image', dataUrl: toDataUrl(cropped, 'image/png') };
}

async function buildWriteInEntry(
  record: WriteInRecord,
  imagesAndLayouts: SheetOf<{ image: Buffer; layout?: BallotPageLayout }>
): Promise<WriteInEntry | undefined> {
  if (record.machineMarkedText) {
    return { type: 'text', text: record.machineMarkedText };
  }

  for (const { image, layout } of imagesAndLayouts) {
    if (!layout) continue;
    const hasContest = layout.contests.some(
      (c) => c.contestId === record.contestId
    );
    if (hasContest) {
      return cropWriteInImage(image, layout, record.contestId, record.optionId);
    }
  }

  debug(
    'no page layout found for contest %s on cvr %s',
    record.contestId,
    record.cvrId
  );
  return undefined;
}

/** Builds write-in image data grouped by candidate for a single contest. */
export async function buildAdminContestWriteIns(
  store: Store,
  electionId: string,
  contestId: ContestId
): Promise<Map<ContestId, AdminContestWriteIns>> {
  const electionRecord = assertDefined(store.getElection(electionId));
  const { election } = electionRecord.electionDefinition;

  const contest = assertDefined(
    election.contests.find(
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.allowWriteIns && c.id === contestId
    )
  );

  const writeInRecords = store.getWriteInRecords({ electionId, contestId });
  const writeInCandidates = store.getWriteInCandidates({
    electionId,
    contestId,
  });
  const writeInCandidatesById = new Map(
    writeInCandidates.map((c) => [c.id, c])
  );

  const imagesAndLayoutsByCvrId = new Map<
    string,
    SheetOf<{ image: Buffer; layout?: BallotPageLayout }>
  >();

  function getImagesAndLayouts(
    cvrId: string
  ): SheetOf<{ image: Buffer; layout?: BallotPageLayout }> {
    const cached = imagesAndLayoutsByCvrId.get(cvrId);
    if (cached) return cached;
    const loaded = store.getBallotImagesAndLayouts({ cvrId });
    imagesAndLayoutsByCvrId.set(cvrId, loaded);
    return loaded;
  }

  const qualifiedCandidateGroups = new Map<string, CandidateGroupWriteIns>();
  const invalidGroup: CandidateGroupWriteIns = {
    groupLabel: 'Invalid',
    isQualified: false,
    writeIns: [],
  };
  const unadjudicatedWriteIns: WriteInEntry[] = [];

  for (const record of writeInRecords) {
    const entry = await buildWriteInEntry(
      record,
      getImagesAndLayouts(record.cvrId)
    );

    if (record.status === 'pending') {
      if (entry) {
        unadjudicatedWriteIns.push(entry);
      }
      continue;
    }

    if (record.adjudicationType === 'invalid') {
      if (entry) {
        invalidGroup.writeIns.push(entry);
      }
    } else {
      if (!qualifiedCandidateGroups.has(record.candidateId)) {
        const candidateName =
          record.adjudicationType === 'write-in-candidate'
            ? assertDefined(writeInCandidatesById.get(record.candidateId)).name
            : assertDefined(
                contest.candidates.find((c) => c.id === record.candidateId)
              ).name;
        qualifiedCandidateGroups.set(record.candidateId, {
          groupLabel: candidateName,
          isQualified: true,
          writeIns: [],
        });
      }
      if (entry) {
        assertDefined(
          qualifiedCandidateGroups.get(record.candidateId)
        ).writeIns.push(entry);
      }
    }
  }

  const candidateGroups: CandidateGroupWriteIns[] = [
    ...[...qualifiedCandidateGroups.values()].sort((a, b) =>
      a.groupLabel.localeCompare(b.groupLabel)
    ),
    ...(invalidGroup.writeIns.length > 0 ? [invalidGroup] : []),
  ];

  return new Map([[contestId, { candidateGroups, unadjudicatedWriteIns }]]);
}

async function buildWriteInImageReport({
  store,
  contestId,
}: {
  store: Store;
  contestId: ContestId;
}): Promise<JSX.Element> {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition, electionPackageHash, isOfficialResults } =
    electionRecord;
  const { areWriteInCandidatesQualified } = store.getSystemSettings(electionId);

  const contestWriteInsById = await buildAdminContestWriteIns(
    store,
    electionId,
    contestId
  );

  return AdminWriteInImageReport({
    electionDefinition,
    electionPackageHash,
    isOfficial: isOfficialResults,
    generatedAtTime: new Date(getCurrentTime()),
    contestWriteInsById,
    qualifiedWriteInsEnabled: areWriteInCandidatesQualified ?? false,
  });
}

interface WriteInImageReportProps {
  store: Store;
  contestId: ContestId;
  logger: Logger;
}

interface WriteInImageReportWarning {
  type: PdfError;
}

/** Preview data returned when generating the write-in image report. */
export interface WriteInImageReportPreview {
  pdf?: Uint8Array;
  warning?: WriteInImageReportWarning;
}

/** Generates the write-in image report and returns a PDF preview. */
export async function generateWriteInImageReportPreview({
  logger,
  ...reportProps
}: WriteInImageReportProps): Promise<WriteInImageReportPreview> {
  const report = await buildWriteInImageReport(reportProps);
  const pdfResult = await renderToPdf({ document: report });
  const result: WriteInImageReportPreview = {
    pdf: pdfResult.ok(),
    warning: pdfResult.isErr() ? { type: pdfResult.err() } : undefined,
  };
  await logger.logAsCurrentRole(LogEventId.ElectionReportPreviewed, {
    message: `User previewed the write-in image report.${
      result.warning ? ` Warning: ${result.warning.type}` : ''
    }`,
    disposition: result.pdf ? 'success' : 'failure',
  });
  return result;
}

/** Generates the write-in image report and sends it to the printer. */
export async function printWriteInImageReport({
  printer,
  logger,
  ...reportProps
}: WriteInImageReportProps & { printer: Printer }): Promise<void> {
  const report = await buildWriteInImageReport(reportProps);
  try {
    const data = (await renderToPdf({ document: report })).unsafeUnwrap();
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `User printed the write-in image report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `Error in attempting to print the write-in image report: ${error.message}`,
      disposition: 'failure',
    });
  }
}

/** Generates the write-in image report and exports it as a PDF file on the USB drive. */
export async function exportWriteInImageReportPdf({
  filename,
  usbDrive,
  logger,
  ...reportProps
}: WriteInImageReportProps & {
  filename: string;
  usbDrive: UsbDrive;
}): Promise<ExportDataResult> {
  const report = await buildWriteInImageReport(reportProps);
  const data = (await renderToPdf({ document: report })).unsafeUnwrap();

  const { store } = reportProps;
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition } = electionRecord;
  const reportsDirectoryPath = generateReportsDirectoryPath(electionDefinition);

  const mountedUsbDrive = await requireMountedUsbDrive(usbDrive);
  if (mountedUsbDrive.isErr()) return mountedUsbDrive;

  const exporter = buildExporter(mountedUsbDrive.ok());
  const exportFileResult = await exporter.exportDataToUsbDrive(
    reportsDirectoryPath,
    filename,
    data
  );

  const reportPath = join(reportsDirectoryPath, filename);
  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: exportFileResult.isOk() ? 'success' : 'failure',
    message: `${
      exportFileResult.isOk() ? 'Saved' : 'Failed to save'
    } write-in image report PDF file to ${reportPath} on the USB drive.`,
    path: reportPath,
  });

  return exportFileResult;
}
