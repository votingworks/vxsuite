import { Election } from '@votingworks/types';
import {
  allBaseBallotProps,
  BallotTemplateId,
  BaseBallotProps,
  NhBallotProps,
  ColorTint,
} from '@votingworks/hmpb';
import { find, throwIllegalValue } from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';
import {
  BallotStyle,
  hasSplits,
  normalizeState,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  UsState,
} from './types';

function getPrecinctSplitForBallotStyle(
  precinct: PrecinctWithSplits,
  ballotStyle: BallotStyle
): PrecinctSplit {
  return find(precinct.splits, (split) =>
    ballotStyle.precinctsOrSplits.some(
      (precinctOrSplit) =>
        precinctOrSplit.precinctId === precinct.id &&
        precinctOrSplit.splitId === split.id
    )
  );
}

export function defaultBallotTemplate(state: string): BallotTemplateId {
  switch (normalizeState(state)) {
    case UsState.NEW_HAMPSHIRE:
      return 'NhBallot';
    case UsState.MISSISSIPPI:
    case UsState.UNKNOWN:
    default:
      return 'VxDefaultBallot';
  }
}

interface ColorTintRecord {
  Customer: string;
  'Election ID': string;
  'Ballot Style Split Name': string;
  'Ballot Style ID': string;
  Color: string;
  Notes: string;
}
const colorTintsCsv = readFileSync(
  join(__dirname, '../src/color-tints.csv'),
  'utf8'
);
const colorTints: ColorTintRecord[] = parse(colorTintsCsv, { columns: true });

export function createBallotPropsForTemplate(
  templateId: BallotTemplateId,
  election: Election,
  precincts: Precinct[],
  ballotStyles: BallotStyle[]
): BaseBallotProps[] {
  function buildNhBallotProps(props: BaseBallotProps): NhBallotProps {
    const precinct = find(precincts, (p) => p.id === props.precinctId);
    if (!hasSplits(precinct)) {
      return props;
    }
    const ballotStyle = find(
      ballotStyles,
      (bs) => bs.id === props.ballotStyleId
    );
    const split = getPrecinctSplitForBallotStyle(precinct, ballotStyle);
    const colorTint = colorTints
      .find(
        (tintRecord) =>
          tintRecord['Election ID'] === election.id &&
          tintRecord['Ballot Style ID'] === ballotStyle.id
      )
      ?.['Color']?.toUpperCase();
    return {
      ...props,
      electionTitleOverride: split.electionTitleOverride,
      electionSealOverride: split.electionSealOverride,
      clerkSignatureImage: split.clerkSignatureImage,
      clerkSignatureCaption: split.clerkSignatureCaption,
      colorTint: colorTint === 'WHITE' ? undefined : (colorTint as ColorTint),
    };
  }

  const baseBallotProps = allBaseBallotProps(election);
  switch (templateId) {
    case 'NhBallot':
    case 'NhBallotV3': {
      return baseBallotProps.map(buildNhBallotProps);
    }

    case 'NhBallotCompact':
    case 'NhBallotV3Compact': {
      return baseBallotProps
        .map(buildNhBallotProps)
        .map((p) => ({ ...p, compact: true }));
    }

    case 'VxDefaultBallot':
      return baseBallotProps;

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(templateId);
    }
  }
}
