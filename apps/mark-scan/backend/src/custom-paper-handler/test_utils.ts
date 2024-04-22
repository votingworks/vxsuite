import {
  DEFAULT_PAPER_HANDLER_STATUS,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';
import { readFile } from '@votingworks/fs';
import { join } from 'path';
import { Buffer } from 'buffer';

const BALLOT_FIXTURE_FRONT_PATH = join(
  __dirname,
  'fixtures',
  'sample-ballot-large-top-margin.pdf'
);
export const MAX_FIXTURE_FILE_SIZE_BYTES = 1024 * 1024 * 50;

export async function readBallotFixture(): Promise<Buffer> {
  const pdfDataResult = await readFile(BALLOT_FIXTURE_FRONT_PATH, {
    maxSize: MAX_FIXTURE_FILE_SIZE_BYTES,
  });
  return pdfDataResult.unsafeUnwrap();
}

export function getDefaultPaperHandlerStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS };
}

export function getPaperParkedStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS, parkSensor: true };
}

export function getPaperInsideStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS, paperPreCisSensor: true };
}

export function getPaperInFrontStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    paperInputLeftInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightInnerSensor: true,
    paperInputRightOuterSensor: true,
  };
}

export function getPaperInRearStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    ticketPresentInOutput: true,
    paperOutSensor: true,
  };
}

export function getPaperJammedStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    ...getPaperInFrontStatus(),
    paperJam: true,
  };
}

export function getJammedButNoPaperStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    paperJam: true,
  };
}
