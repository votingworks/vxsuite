/* eslint-disable no-console */
import { readElection } from '@votingworks/fs';
import { writeFile } from 'node:fs/promises';
import {
  BallotType,
  BaseBallotProps,
  HmpbBallotPaperSize,
  PartyId,
} from '@votingworks/types';
import { createPlaywrightRenderer } from './playwright_renderer';
import {
  BallotTemplateId,
  ballotTemplates,
  NhPrimaryBallotProps,
} from './ballot_templates';
import { renderBallotPreviewToPdf } from './render_ballot';
import { render as renderRovForm } from './ballot_templates/nh_rov_form';

const USAGE = `Usage: render-ballot-pdf <ballot-template-id> <election-path> <output-pdf-path>`;

interface BallotSpec {
  electionPath: string;
  props: Partial<NhPrimaryBallotProps>;
  ballotTemplateId: BallotTemplateId;
  outputPdfPath: string;
}

const dir = '/media/psf/VMSharing/nh-ballots';

function makeGeneralElectionSpecs(
  town: string,
  props: Partial<NhGeneralBallotProps> = {}
): BallotSpec[] {
  const electionPath = `${dir}/${town}-general-election.json`;
  const outputPathPrefix = `${dir}/${town}-general-ballot`;
  return [
    {
      electionPath,
      props: { ballotType: BallotType.Precinct, ...props },
      ballotTemplateId: 'NhGeneralBallot',
      outputPdfPath: `${outputPathPrefix}-precinct.pdf`,
    },
    {
      electionPath,
      props: { ballotType: BallotType.Absentee, ...props },
      ballotTemplateId: 'NhGeneralBallot',
      outputPdfPath: `${outputPathPrefix}-absentee.pdf`,
    },
    {
      electionPath,
      props: { isFederalOnlyOffices: true, ...props },
      ballotTemplateId: 'NhGeneralBallot',
      outputPdfPath: `${outputPathPrefix}-foo.pdf`,
    },
    {
      electionPath,
      props: { ballotMode: 'sample', ...props },
      ballotTemplateId: 'NhGeneralBallot',
      outputPdfPath: `${outputPathPrefix}-sample.pdf`,
    },
  ];
}

function makePrimaryElectionSpecs(
  town: string,
  party: 'rep' | 'dem',
  props: Partial<NhPrimaryBallotProps> = {}
): BallotSpec[] {
  const colorTint = party === 'rep' ? 'RED' : 'BLUE';
  const electionPath = `${dir}/${town}-primary-election-${party}.json`;
  const outputPathPrefix = `${dir}/${town}-primary-ballot-${party}`;
  return [
    {
      electionPath,
      props: { ballotType: BallotType.Precinct, colorTint, ...props },
      ballotTemplateId: 'NhPrimaryBallot',
      outputPdfPath: `${outputPathPrefix}-precinct.pdf`,
    },
    {
      electionPath,
      props: { ballotType: BallotType.Absentee, colorTint, ...props },
      ballotTemplateId: 'NhPrimaryBallot',
      outputPdfPath: `${outputPathPrefix}-absentee.pdf`,
    },
    {
      electionPath,
      props: { isFederalOnlyOffices: true, colorTint, ...props },
      ballotTemplateId: 'NhPrimaryBallot',
      outputPdfPath: `${outputPathPrefix}-foo.pdf`,
    },
    {
      electionPath,
      props: { ballotMode: 'sample', colorTint, ...props },
      ballotTemplateId: 'NhPrimaryBallot',
      outputPdfPath: `${outputPathPrefix}-sample.pdf`,
    },
  ];
}

const ballotSpecs = [
  ...makeGeneralElectionSpecs('londonderry'),
  ...makePrimaryElectionSpecs('londonderry', 'rep'),
  ...makePrimaryElectionSpecs('londonderry', 'dem'),
  ...makeGeneralElectionSpecs('hudson'),
  ...makePrimaryElectionSpecs('hudson', 'rep'),
  ...makeGeneralElectionSpecs('monroe', { isHandCount: true }),
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

export async function main(args: string[]): Promise<number> {
  // if (args.length !== 3) {
  //   console.error(USAGE);
  //   return 1;
  // }
  // const [ballotTemplateId, electionPath, outputPdfPath] = args;

  const renderer = await createPlaywrightRenderer();
  for (const spec of ballotSpecs) {
    const { election } = (await readElection(spec.electionPath)).unsafeUnwrap();
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

void main(process.argv.slice(2)).then((code) => process.exit(code));
