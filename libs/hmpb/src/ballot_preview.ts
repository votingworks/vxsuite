import {
  assert,
  assertDefined,
  find,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { type Translator, translateBallotStrings } from '@votingworks/backend';
import {
  type BallotLanguageConfigs,
  type BallotMode,
  type BallotStyleId,
  BallotType,
  type BaseBallotProps,
  type Election,
  type GetCandidateOrderingsFn,
  getPrecinctById,
  hasSplits,
} from '@votingworks/types';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import {
  type AnyBallotProps,
  type BallotTemplateId,
  ballotTemplates,
  type NhBallotProps,
  type NhStateBallotProps,
  type NhStateBallotVariant,
} from './ballot_templates/index.js';
import { hmpbStringsCatalog } from './hmpb_strings.js';
import type { BallotLayoutError } from './render_common.js';
import {
  allBaseBallotProps,
  renderBallotPreviewToPdf,
} from './render_ballot.js';
import type { SingletonRenderer } from './renderer.js';

export function createBallotPropsForTemplate(
  templateId: BallotTemplateId,
  election: Election,
  compact: boolean
): AnyBallotProps[] {
  function buildNhBallotProps(props: BaseBallotProps): NhBallotProps {
    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (!hasSplits(precinct)) {
      return { ...props };
    }
    const split = find(precinct.splits, (ps) =>
      ballotStyleHasPrecinctOrSplit(props.ballotStyle, { precinct, split: ps })
    );
    return {
      ...props,
      electionTitleOverride: split.electionTitleOverride,
      electionSealOverride: split.electionSealOverride,
      clerkSignatureImage: split.clerkSignatureImage,
      clerkSignatureCaption: split.clerkSignatureCaption,
    };
  }

  function buildNhStateBallotProps(
    props: BaseBallotProps
  ): NhStateBallotProps[] {
    return [
      props,
      ...(props.ballotMode === 'official' &&
      props.ballotType === BallotType.Absentee
        ? ([
            {
              ...props,
              ballotType: BallotType.Absentee,
              ballotMode: 'official',
              variant: 'federalOfficeOnly',
            },
            {
              ...props,
              ballotType: BallotType.Absentee,
              ballotMode: 'official',
              variant: 'uocava',
            },
          ] as const)
        : []),
    ];
  }

  assert(election.ballotStyles.length > 0, 'Election has no ballot styles');
  const baseBallotProps = allBaseBallotProps(election).map((props) => ({
    ...props,
    compact,
  }));
  switch (templateId) {
    case 'NhBallot':
      return baseBallotProps.map(buildNhBallotProps);

    case 'NhStateBallot':
      return baseBallotProps.flatMap(buildNhStateBallotProps);

    case 'MsBallot':
    case 'VxDefaultBallot':
    case 'MiBallot':
      return baseBallotProps;

    default: {
      throwIllegalValue(templateId);
    }
  }
}

export function getBallotPdfFileName(props: AnyBallotProps): string {
  const precinct = assertDefined(getPrecinctById(props));
  const variantSuffixes: Record<NhStateBallotVariant, string> = {
    federalOfficeOnly: 'foo',
    uocava: 'uocava',
  };
  const variantSuffix =
    'variant' in props && props.variant
      ? variantSuffixes[props.variant]
      : undefined;
  const baseName = [
    props.ballotMode,
    props.ballotType,
    'ballot',
    precinct.name.replaceAll(' ', '_'),
    props.ballotStyle.id,
    props.ballotAuditId,
    variantSuffix,
  ]
    .filter(Boolean)
    .join('-');
  return `${baseName}.pdf`;
}

export interface BallotPreviewSpec {
  precinctId: string;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
  variant?: NhStateBallotVariant;
}

export interface BallotPreviewPdf {
  pdfData: Uint8Array;
  fileName: string;
}

export async function renderBallotPreview({
  election,
  ballotLanguageConfigs,
  ballotTemplateId,
  getCandidateOrderings,
  compact,
  shouldTransliterateCandidateNames,
  translator,
  createRenderer,
  spec,
}: {
  election: Election;
  ballotLanguageConfigs: BallotLanguageConfigs;
  ballotTemplateId: BallotTemplateId;
  getCandidateOrderings: GetCandidateOrderingsFn;
  compact: boolean;
  shouldTransliterateCandidateNames?: boolean;
  translator: Translator;
  createRenderer: () => Promise<SingletonRenderer>;
  spec: BallotPreviewSpec;
}): Promise<Result<BallotPreviewPdf, BallotLayoutError>> {
  const ballotStrings = await translateBallotStrings(
    translator,
    election,
    hmpbStringsCatalog,
    ballotLanguageConfigs,
    { shouldTransliterateCandidateNames }
  );
  const electionWithBallotStrings: Election = {
    ...election,
    ballotStrings,
  };
  const allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    electionWithBallotStrings,
    compact
  );
  const ballotProps = find(
    allBallotProps,
    (props) =>
      props.precinctId === spec.precinctId &&
      props.ballotStyle.id === spec.ballotStyleId &&
      props.ballotType === spec.ballotType &&
      props.ballotMode === spec.ballotMode &&
      (ballotTemplateId === 'NhStateBallot'
        ? (props as NhStateBallotProps).variant === spec.variant
        : true)
  );
  const renderer = await createRenderer();
  let ballotPdf: Result<Uint8Array, BallotLayoutError>;
  try {
    ballotPdf = await renderBallotPreviewToPdf(
      renderer,
      ballotTemplates[ballotTemplateId],
      getCandidateOrderings(ballotProps.ballotStyle),
      // NOTE: Changing this text means you should also change the font size
      // of the <Watermark> component in the ballot template.
      { ...ballotProps, watermark: 'PROOF' }
    );
  } finally {
    // eslint-disable-next-line no-console
    renderer.close().catch(console.error);
  }
  if (ballotPdf.isErr()) return ballotPdf;

  return ok({
    pdfData: ballotPdf.ok(),
    fileName: `PROOF-${getBallotPdfFileName(ballotProps)}`,
  });
}
