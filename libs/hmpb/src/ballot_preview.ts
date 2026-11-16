import {
  assert,
  assertDefined,
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  allBaseBallotProps,
  type AnyBallotProps,
  type BallotTemplateId,
  type NhBallotProps,
  type NhStateBallotProps,
  type NhStateBallotVariant,
} from '@votingworks/hmpb';
import {
  BallotType,
  type BaseBallotProps,
  type Election,
  getPrecinctById,
  hasSplits,
} from '@votingworks/types';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';

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
