import {
  CandidateRotation,
  Election,
  hasSplits,
  PrecinctSplit,
  PrecinctWithSplits,
  UiStringsPackage,
} from '@votingworks/types';
import {
  allBaseBallotProps,
  BallotTemplateId,
  BaseBallotProps,
  NhBallotProps,
  ColorTint,
  ColorTints,
} from '@votingworks/hmpb';
import { find, throwIllegalValue, assert } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';
import { sliOrgId } from './globals';
import { BallotStyle, normalizeState, User, UsState } from './types';
import {
  rotateCandidateByOffset,
  rotateCandidatesByNhStatutes,
} from './candidate_rotation';

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

export function defaultBallotTemplate(
  state: string,
  user: User
): BallotTemplateId {
  if (user.orgId === sliOrgId()) {
    return 'VxDefaultBallot';
  }

  switch (normalizeState(state)) {
    case UsState.NEW_HAMPSHIRE:
      return 'NhBallot';
    case UsState.MISSISSIPPI:
    case UsState.UNKNOWN:
    default:
      return 'VxDefaultBallot';
  }
}

export function formatElectionForExport(
  election: Election,
  ballotStrings: UiStringsPackage
): Election {
  const splitPrecincts = election.precincts.filter((p) => hasSplits(p));

  const signatureImageBySplit = splitPrecincts.flatMap((p) =>
    p.splits.flatMap((split) =>
      split.clerkSignatureImage
        ? [[`${p.id}-${split.id}`, sha256(split.clerkSignatureImage)]]
        : []
    )
  );
  const sealOverrideBySplit = splitPrecincts.flatMap((p) =>
    p.splits.flatMap((split) =>
      split.electionSealOverride
        ? [[`${p.id}-${split.id}`, sha256(split.electionSealOverride)]]
        : []
    )
  );

  const additionalHashInput: Record<string, Record<string, string>> = {
    precinctSplitSeals: Object.fromEntries(sealOverrideBySplit),
    precinctSplitSignatureImages: Object.fromEntries(signatureImageBySplit),
  };

  return {
    ...election,
    ballotStrings,
    additionalHashInput: {
      ...(election.additionalHashInput || {}),
      ...additionalHashInput,
    },
  };
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
  ballotStyles: BallotStyle[],
  compact: boolean
): BaseBallotProps[] {
  function buildNhBallotProps(props: BaseBallotProps): NhBallotProps {
    const rotateCandidatesByPrecinct = false; // TODO flag by election or organization
    const precinctIndex = election.precincts.findIndex(
      (p) => p.id === props.precinctId
    );
    const candidateRotation: CandidateRotation = Object.fromEntries(
      election.contests
        .filter((contest) => contest.type === 'candidate')
        .map((contest) => [
          contest.id,
          rotateCandidatesByPrecinct
            ? rotateCandidateByOffset(contest, precinctIndex)
            : rotateCandidatesByNhStatutes(contest),
        ])
    );

    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (!hasSplits(precinct)) {
      return { ...props, candidateRotation };
    }
    const ballotStyle = find(
      ballotStyles,
      (bs) => bs.id === props.ballotStyleId
    );
    const split = getPrecinctSplitForBallotStyle(precinct, ballotStyle);
    let colorTint = colorTints
      .find(
        (tintRecord) =>
          tintRecord['Election ID'] === election.id &&
          tintRecord['Ballot Style ID'] === ballotStyle.id
      )
      ?.['Color'].toUpperCase();
    if (colorTint === 'WHITE') {
      colorTint = undefined;
    }
    if (colorTint) {
      assert(colorTint in ColorTints, `Invalid color tint: ${colorTint}`);
    }
    return {
      ...props,
      electionTitleOverride: split.electionTitleOverride,
      electionSealOverride: split.electionSealOverride,
      clerkSignatureImage: split.clerkSignatureImage,
      clerkSignatureCaption: split.clerkSignatureCaption,
      colorTint: colorTint as ColorTint,
      candidateRotation,
    };
  }

  const baseBallotProps = allBaseBallotProps(election).map((props) => ({
    ...props,
    compact,
  }));
  switch (templateId) {
    case 'NhBallot':
      return baseBallotProps.map(buildNhBallotProps);

    case 'VxDefaultBallot':
      return baseBallotProps;

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(templateId);
    }
  }
}
