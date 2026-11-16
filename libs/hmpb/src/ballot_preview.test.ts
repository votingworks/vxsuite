import {
  electionFamousNames2021Fixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import {
  BallotType,
  type BaseBallotProps,
  hasSplits,
  LanguageCode,
} from '@votingworks/types';
import { expect, test, vi } from 'vitest';
import type { Translator } from '@votingworks/backend';
import { assert, deepEqual, err, find, iter } from '@votingworks/basics';
import type {
  NhBallotProps,
  NhStateBallotProps,
} from './ballot_templates/index.js';
import {
  createBallotPropsForTemplate,
  getBallotPdfFileName,
  renderBallotPreview,
} from './ballot_preview.js';
import { createPlaywrightRenderer } from './playwright_renderer.js';
import { renderBallotPreviewToPdf } from './render_ballot.js';
import type { SingletonRenderer } from './renderer.js';

vi.mock(import('./render_ballot.js'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderBallotPreviewToPdf: vi.fn(original.renderBallotPreviewToPdf),
  } as unknown as typeof original;
});

vi.setConfig({
  testTimeout: 120_000,
});

const englishOnlyTranslator: Translator = {
  translateText: () => {
    throw new Error('Unexpected translation request');
  },
};

const election = readElectionGeneral();

test('createBallotPropsForTemplate', () => {
  const vxDefaultBallotProps = createBallotPropsForTemplate(
    'VxDefaultBallot',
    election,
    false
  ) as BaseBallotProps[];
  for (const props of vxDefaultBallotProps) {
    expect(props.compact).toEqual(false);
  }

  const msBallotProps = createBallotPropsForTemplate(
    'MsBallot',
    election,
    false
  );
  expect(msBallotProps).toEqual(vxDefaultBallotProps);

  const nhBallotProps = createBallotPropsForTemplate(
    'NhBallot',
    election,
    true
  ) as NhBallotProps[];
  assert(election.precincts.some((p) => hasSplits(p)));
  for (const props of nhBallotProps) {
    expect(props.compact).toEqual(true);
    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (hasSplits(precinct)) {
      expect('electionTitleOverride' in props).toEqual(true);
      expect('electionSealOverride' in props).toEqual(true);
      expect('clerkSignatureImage' in props).toEqual(true);
      expect('clerkSignatureCaption' in props).toEqual(true);
    }
  }

  const nhStateBallotProps: NhStateBallotProps[] = createBallotPropsForTemplate(
    'NhStateBallot',
    election,
    false
  );
  const [allDerivedProps, allRegularProps] = iter(nhStateBallotProps).partition(
    (props) => props.variant !== undefined
  );
  for (const regularProps of allRegularProps) {
    const matchingFooProps = allDerivedProps.find((derivedProps) =>
      deepEqual(derivedProps, {
        ...regularProps,
        variant: 'federalOfficeOnly',
      })
    );
    const matchingUocavaProps = allDerivedProps.find((derivedProps) =>
      deepEqual(derivedProps, { ...regularProps, variant: 'uocava' })
    );
    if (
      regularProps.ballotMode === 'official' &&
      regularProps.ballotType === BallotType.Absentee
    ) {
      expect(matchingFooProps).toBeDefined();
      expect(matchingUocavaProps).toBeDefined();
    } else {
      expect(matchingFooProps).toBeUndefined();
      expect(matchingUocavaProps).toBeUndefined();
    }
  }
});

const baseProps = {
  election,
  ballotStyle: find(election.ballotStyles, (b) => b.id === '12'),
  precinctId: '23',
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
} as const satisfies BaseBallotProps;

test('getBallotPdfFileName base case replaces spaces in precinct name', () => {
  expect(getBallotPdfFileName(baseProps)).toEqual(
    'official-precinct-ballot-Center_Springfield-12.pdf'
  );
});

test('getBallotPdfFileName includes ballotAuditId when present', () => {
  expect(getBallotPdfFileName({ ...baseProps, ballotAuditId: '7' })).toEqual(
    'official-precinct-ballot-Center_Springfield-12-7.pdf'
  );
});

test('getBallotPdfFileName appends -foo for federalOfficeOnly variant', () => {
  const props: NhStateBallotProps = {
    ...baseProps,
    ballotType: BallotType.Absentee,
    variant: 'federalOfficeOnly',
  };
  expect(getBallotPdfFileName(props)).toEqual(
    'official-absentee-ballot-Center_Springfield-12-foo.pdf'
  );
});

test('getBallotPdfFileName appends -uocava for uocava variant', () => {
  const props: NhStateBallotProps = {
    ...baseProps,
    ballotType: BallotType.Absentee,
    variant: 'uocava',
  };
  expect(getBallotPdfFileName(props)).toEqual(
    'official-absentee-ballot-Center_Springfield-12-uocava.pdf'
  );
});

test('renderBallotPreview renders a watermarked proof and closes the renderer', async () => {
  const famousNames = electionFamousNames2021Fixtures.readElection();
  const ballotStyle = famousNames.ballotStyles[0]!;
  const precinctId = ballotStyle.precincts[0]!;
  const precinct = find(famousNames.precincts, (p) => p.id === precinctId);
  let renderer: SingletonRenderer | undefined;
  const getCandidateOrderings = vi.fn(
    () => ballotStyle.orderedCandidatesByContest
  );

  const result = await renderBallotPreview({
    election: famousNames,
    ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
    ballotTemplateId: 'VxDefaultBallot',
    getCandidateOrderings,
    compact: false,
    translator: englishOnlyTranslator,
    async createRenderer() {
      renderer = await createPlaywrightRenderer();
      vi.spyOn(renderer, 'close');
      return renderer;
    },
    spec: {
      precinctId,
      ballotStyleId: ballotStyle.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    },
  });

  const { pdfData, fileName } = result.unsafeUnwrap();
  expect(fileName).toEqual(
    `PROOF-test-precinct-ballot-${precinct.name.replaceAll(' ', '_')}-${
      ballotStyle.id
    }.pdf`
  );
  expect(new TextDecoder().decode(pdfData.slice(0, 5))).toEqual('%PDF-');
  expect(getCandidateOrderings).toHaveBeenCalledWith(
    expect.objectContaining({ id: ballotStyle.id })
  );
  expect(vi.mocked(renderBallotPreviewToPdf)).toHaveBeenLastCalledWith(
    renderer,
    expect.anything(),
    ballotStyle.orderedCandidatesByContest,
    expect.objectContaining({
      watermark: 'PROOF',
      compact: false,
      ballotStyle: expect.objectContaining({ id: ballotStyle.id }),
    })
  );
  expect(renderer!.close).toHaveBeenCalled();
});

test('renderBallotPreview matches the NH state ballot variant and returns layout errors', async () => {
  const ballotStyle = election.ballotStyles[0]!;
  const precinctId = ballotStyle.precincts[0]!;
  const close = vi.fn(() => Promise.resolve());
  const renderer = { close } as unknown as SingletonRenderer;
  vi.mocked(renderBallotPreviewToPdf).mockResolvedValueOnce(
    err({ error: 'missingSignature' })
  );

  const result = await renderBallotPreview({
    election,
    ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
    ballotTemplateId: 'NhStateBallot',
    getCandidateOrderings: () => null,
    compact: true,
    shouldTransliterateCandidateNames: false,
    translator: englishOnlyTranslator,
    createRenderer: () => Promise.resolve(renderer),
    spec: {
      precinctId,
      ballotStyleId: ballotStyle.id,
      ballotType: BallotType.Absentee,
      ballotMode: 'official',
      variant: 'federalOfficeOnly',
    },
  });

  expect(result).toEqual(err({ error: 'missingSignature' }));
  expect(vi.mocked(renderBallotPreviewToPdf)).toHaveBeenLastCalledWith(
    renderer,
    expect.anything(),
    null,
    expect.objectContaining({
      variant: 'federalOfficeOnly',
      ballotType: BallotType.Absentee,
      watermark: 'PROOF',
    })
  );
  expect(close).toHaveBeenCalled();
});
