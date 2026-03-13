import { DateWithoutTime } from '@votingworks/basics';
import {
  BallotStyleId,
  BallotType,
  CandidateContest,
  DistrictId,
  Election,
  ElectionId,
  HmpbBallotPaperSize,
  PrecinctId,
} from '@votingworks/types';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ballotTemplates } from './ballot_templates';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { layOutBallotsAndCreateElectionDefinition } from './render_ballot';

const DISTRICT_ID = 'district-1' as DistrictId;
const PRECINCT_ID = 'precinct-1' as PrecinctId;
const BALLOT_STYLE_ID = 'ballot-style-1' as BallotStyleId;

// Printer icon SVG — path data sourced from FontAwesome faPrint (fas, v6.7.2)
const PRINTER_SEAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M128 0C92.7 0 64 28.7 64 64l0 96 64 0 0-96 226.7 0L384 93.3l0 66.7 64 0 0-66.7c0-17-6.7-33.3-18.7-45.3L400 18.7C388 6.7 371.7 0 354.7 0L128 0zM384 352l0 32 0 64-256 0 0-64 0-16 0-16 256 0zm64 32l32 0c17.7 0 32-14.3 32-32l0-96c0-35.3-28.7-64-64-64L64 192c-35.3 0-64 28.7-64 64l0 96c0 17.7 14.3 32 32 32l32 0 0 64c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-64zM432 248a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/>
</svg>`;

function makeContest(n: number): CandidateContest {
  return {
    type: 'candidate',
    id: `contest-${n}`,
    districtId: DISTRICT_ID,
    title: `Contest ${n}`,
    seats: 1,
    allowWriteIns: false,
    candidates: ['A', 'B', 'C'].map((letter) => ({
      id: `contest-${n}-candidate-${letter.toLowerCase()}`,
      name: `Candidate ${letter}`,
    })),
  };
}

// 27 contests fills both sides of a letter ballot.
const NUM_CONTESTS = 27;

function makeElection(): Election {
  const contests = Array.from({ length: NUM_CONTESTS }, (_, i) =>
    makeContest(i + 1)
  );
  return {
    id: 'vxprint-test-print' as ElectionId,
    title: 'VxPrint Test Print',
    type: 'general',
    state: 'Test State',
    county: { id: 'test-county', name: 'Test County' },
    date: new DateWithoutTime('2222-02-22'),
    seal: PRINTER_SEAL_SVG,
    parties: [],
    districts: [{ id: DISTRICT_ID, name: 'Test District' }],
    precincts: [
      { id: PRECINCT_ID, name: 'Test Precinct', districtIds: [DISTRICT_ID] },
    ],
    contests,
    ballotStyles: [
      {
        id: BALLOT_STYLE_ID,
        groupId: BALLOT_STYLE_ID,
        precincts: [PRECINCT_ID],
        districts: [DISTRICT_ID],
      },
    ],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
}

function usage(out: NodeJS.WriteStream) {
  out.write(`Usage: generate-vxprint-test-print --output <path>\n`);
}

export async function main(): Promise<number> {
  let outputPath: string | undefined;

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '-h' || arg === '--help') {
      usage(process.stdout);
      return 0;
    }
    if (arg === '--output') {
      i += 1;
      outputPath = process.argv[i];
    } else {
      usage(process.stderr);
      return 1;
    }
  }

  if (!outputPath) {
    usage(process.stderr);
    return 1;
  }

  const resolvedOutputPath = resolve(outputPath);
  const election = makeElection();
  const ballotProps = [
    {
      election,
      ballotStyleId: BALLOT_STYLE_ID,
      precinctId: PRECINCT_ID,
      ballotType: BallotType.Precinct,
      ballotMode: 'test' as const,
      watermark: 'TEST',
    },
  ];

  process.stdout.write('Creating renderer pool...\n');
  const rendererPool = await createPlaywrightRendererPool();

  try {
    process.stdout.write('Rendering ballot...\n');
    // Use layOutBallotsAndCreateElectionDefinition + direct renderToPdf so
    // that the QR code slot is present (for layout) but is never filled in,
    // making it clear this ballot is not meant to be scanned.
    const { ballotContents } = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      ballotProps,
      'vxf'
    );

    const pdf = await rendererPool.runTask(async (renderer) => {
      const document = await renderer.loadDocumentFromContent(
        ballotContents[0]
      );
      return document.renderToPdf();
    });

    await writeFile(resolvedOutputPath, pdf);
    process.stdout.write(`Written to ${resolvedOutputPath}\n`);
  } finally {
    await rendererPool.close();
  }

  return 0;
}
