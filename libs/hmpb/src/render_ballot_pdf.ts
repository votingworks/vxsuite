/* eslint-disable no-console */
import { readElection } from '@votingworks/fs';
import { writeFile } from 'node:fs/promises';
import { BallotType, HmpbBallotPaperSize, PartyId } from '@votingworks/types';
import { createPlaywrightRenderer } from './playwright_renderer';
import {
  BallotTemplateId,
  ballotTemplates,
  NhGeneralBallotProps,
  NhPrimaryBallotProps,
} from './ballot_templates';
import { renderBallotPreviewToPdf } from './render_ballot';
import { render as renderRovForm } from './ballot_templates/nh_rov_form';

interface BallotSpec {
  electionPath: string;
  props: Partial<NhPrimaryBallotProps>;
  ballotTemplateId: BallotTemplateId;
  outputPdfPath: string;
  paperSize?: HmpbBallotPaperSize;
}

const dir = '/media/psf/VMSharing/nh-ballots';

function makeGeneralElectionSpecs(
  town: string,
  {
    paperSize,
    ...props
  }: Partial<NhGeneralBallotProps> & { paperSize?: HmpbBallotPaperSize } = {}
): BallotSpec[] {
  const electionPath = `${dir}/${town}-general-election.json`;
  const outputPathPrefix = `${dir}/${town}-general-ballot`;
  const base: Pick<
    BallotSpec,
    'electionPath' | 'ballotTemplateId' | 'paperSize'
  > = {
    electionPath,
    ballotTemplateId: 'NhGeneralBallot',
    paperSize,
  };
  return [
    {
      ...base,
      props: { ballotType: BallotType.Precinct, ...props },
      outputPdfPath: `${outputPathPrefix}-precinct.pdf`,
    },
    {
      ...base,
      props: { ballotType: BallotType.Absentee, ...props },
      outputPdfPath: `${outputPathPrefix}-absentee.pdf`,
    },
    {
      ...base,
      props: {
        ballotType: BallotType.Absentee,
        isFederalOnlyOffices: true,
        ...props,
      },
      outputPdfPath: `${outputPathPrefix}-foo.pdf`,
    },
    {
      ...base,
      props: { ballotMode: 'sample', ...props },
      outputPdfPath: `${outputPathPrefix}-sample.pdf`,
    },
  ];
}

function makePrimaryElectionSpecs(
  town: string,
  party: 'rep' | 'dem',
  {
    paperSize,
    ...props
  }: Partial<NhPrimaryBallotProps> & { paperSize?: HmpbBallotPaperSize } = {}
): BallotSpec[] {
  const colorTint = party === 'rep' ? 'RED' : 'BLUE';
  const electionPath = `${dir}/${town}-primary-election-${party}.json`;
  const outputPathPrefix = `${dir}/${town}-primary-ballot-${party}`;
  const base: Pick<
    BallotSpec,
    'electionPath' | 'ballotTemplateId' | 'paperSize'
  > = {
    electionPath,
    ballotTemplateId: 'NhPrimaryBallot',
    paperSize,
  };
  return [
    {
      ...base,
      props: { ballotType: BallotType.Precinct, colorTint, ...props },
      outputPdfPath: `${outputPathPrefix}-precinct.pdf`,
    },
    {
      ...base,
      props: { ballotType: BallotType.Absentee, colorTint, ...props },
      outputPdfPath: `${outputPathPrefix}-absentee.pdf`,
    },
    {
      ...base,
      props: {
        ballotType: BallotType.Absentee,
        isFederalOnlyOffices: true,
        colorTint,
        ...props,
      },
      outputPdfPath: `${outputPathPrefix}-foo.pdf`,
    },
    {
      ...base,
      props: { ballotMode: 'sample', colorTint, ...props },
      outputPdfPath: `${outputPathPrefix}-sample.pdf`,
    },
  ];
}

const ballotSpecs = [
  ...makeGeneralElectionSpecs('londonderry', {
    paperSize: HmpbBallotPaperSize.Custom18,
  }),
  ...makePrimaryElectionSpecs('londonderry', 'rep', {
    paperSize: HmpbBallotPaperSize.Legal,
  }),
  ...makePrimaryElectionSpecs('londonderry', 'dem', {
    paperSize: HmpbBallotPaperSize.Legal,
  }),
  // Letter (not Custom18) on Hudson so the ballot spans two pages and NH can
  // review the VOTE BOTH SIDES footer treatment on an actual ballot.
  ...makeGeneralElectionSpecs('hudson'),
  ...makePrimaryElectionSpecs('hudson', 'dem'),
  ...makeGeneralElectionSpecs('monroe', {
    isHandCount: true,
    paperSize: HmpbBallotPaperSize.Legal,
  }),
  ...makePrimaryElectionSpecs('monroe', 'rep', { isHandCount: true }),
  ...makePrimaryElectionSpecs('monroe', 'dem', { isHandCount: true }),
];

interface RovSpec {
  electionPath: string;
  partyId?: PartyId;
  outputPdfPath: string;
}

const rovSpecs: RovSpec[] = [
  {
    electionPath: `${dir}/monroe-general-election.json`,
    outputPdfPath: `${dir}/monroe-general-rov.pdf`,
  },
  {
    electionPath: `${dir}/monroe-primary-election-rep.json`,
    partyId: 'o76ud7u6rqe4',
    outputPdfPath: `${dir}/monroe-primary-rov-rep.pdf`,
  },
  {
    electionPath: `${dir}/monroe-primary-election-dem.json`,
    partyId: 'z8l5d9a22v5j',
    outputPdfPath: `${dir}/monroe-primary-rov-dem.pdf`,
  },
];

export async function main(): Promise<number> {
  // if (args.length !== 3) {
  //   console.error(USAGE);
  //   return 1;
  // }
  // const [ballotTemplateId, electionPath, outputPdfPath] = args;

  const renderer = await createPlaywrightRenderer();
  for (const spec of ballotSpecs) {
    console.log('Rendering', spec.outputPdfPath);
    let { election } = (await readElection(spec.electionPath)).unsafeUnwrap();
    if (spec.paperSize) {
      election = {
        ...election,
        ballotLayout: { ...election.ballotLayout, paperSize: spec.paperSize },
      };
    }
    // const document = await render(renderer, {
    //   election,
    //   partyId: election.parties[0]?.id,
    // });
    // const pdfBytes = await document.renderToPdf();

    const ballotTemplate = ballotTemplates[spec.ballotTemplateId];
    if (!ballotTemplate) {
      console.error(`Unknown ballot template ID: ${spec.ballotTemplateId}`);
      return 1;
    }

    const pdfBytes = (
      await renderBallotPreviewToPdf(renderer, ballotTemplate, {
        election,
        ballotMode: 'official',
        ballotType: BallotType.Precinct,
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.ballotStyles[0].precincts[0],
        watermark: 'PROOF',
        ...spec.props,
      })
    ).unsafeUnwrap();
    await writeFile(spec.outputPdfPath, pdfBytes);
  }
  // Render ROV forms
  for (const spec of rovSpecs) {
    const { election } = (await readElection(spec.electionPath)).unsafeUnwrap();
    const document = await renderRovForm(renderer, {
      election,
      partyId: spec.partyId,
    });
    const pdfBytes = await document.renderToPdf();
    await writeFile(spec.outputPdfPath, pdfBytes);
    console.log(`Wrote ${spec.outputPdfPath}`);
  }

  await renderer.close();

  return 0;
}
