import {
  BallotType,
  BaseBallotProps,
  centralScanningPollingPlaceId,
  CENTRAL_SCANNING_POLLING_PLACE_NAME,
  earlyVotingPollingPlaceId,
  EARLY_VOTING_POLLING_PLACE_NAME,
  Election,
  hasSplits,
  PollingPlace,
  pollingPlacesGenerateFromPrecincts,
  SystemSettings,
  UiStringsPackage,
} from '@votingworks/types';
import {
  allBaseBallotProps,
  AnyBallotProps,
  BallotTemplateId,
  NhBallotProps,
  NhStateBallotProps,
} from '@votingworks/hmpb';
import { assert, find, throwIllegalValue } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import { getStateFeaturesConfig } from './features';
import { Jurisdiction } from './types';

export function defaultBallotTemplate(
  jurisdiction: Jurisdiction
): BallotTemplateId {
  switch (jurisdiction.stateCode) {
    case 'DEMO':
      return 'VxDefaultBallot';
    case 'MI':
      return 'MiBallot';
    case 'MS':
      return 'MsBallot';
    case 'NH':
      return 'NhBallot';
    default: {
      throwIllegalValue(jurisdiction.stateCode);
    }
  }
}

function allPrecinctsWhole(election: Election): PollingPlace['precincts'] {
  return Object.fromEntries(
    election.precincts.map((precinct) => [precinct.id, { type: 'whole' }])
  );
}

/**
 * Auto-generates polling places for states that don't require the ability to custom define them
 * and for whom we accordingly hide the polling place editor.
 */
export function addPollingPlacesForExport(
  election: Election,
  jurisdiction: Jurisdiction,
  systemSettings: SystemSettings
): Election {
  const stateFeatures = getStateFeaturesConfig(jurisdiction);

  if (stateFeatures.EDIT_POLLING_PLACES) {
    return election;
  }

  // Generate an election day polling place for each precinct
  const pollingPlaces = pollingPlacesGenerateFromPrecincts(
    election.precincts,
    'election_day',
    (p) => `${p.id}-polling-place`
  );

  // Generate a single central scanning polling place covering all precincts if necessary
  if (!stateFeatures.OMIT_ABSENTEE_POLLING_PLACES) {
    pollingPlaces.push({
      id: centralScanningPollingPlaceId(election.id),
      name: CENTRAL_SCANNING_POLLING_PLACE_NAME,
      type: 'absentee',
      precincts: allPrecinctsWhole(election),
    });
  }

  // Generate a single early voting polling place covering all precincts if necessary
  if (systemSettings.enableEarlyVoting) {
    pollingPlaces.push({
      id: earlyVotingPollingPlaceId(election.id),
      name: EARLY_VOTING_POLLING_PLACE_NAME,
      type: 'early_voting',
      precincts: allPrecinctsWhole(election),
    });
  }

  return { ...election, pollingPlaces };
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

  // The v4.0 conversion of multi-option yesno contests to candidate contests
  // (which drops the description) is handled in `convertLatestElectionToV4p0`,
  // including preserving the dropped descriptions in additionalHashInput.
  const additionalHashInput = {
    precinctSplitSeals: Object.fromEntries(sealOverrideBySplit),
    precinctSplitSignatureImages: Object.fromEntries(signatureImageBySplit),
  } as const;

  return {
    ...election,
    ballotStrings,
    additionalHashInput: {
      ...(election.additionalHashInput || {}),
      ...additionalHashInput,
    },
  };
}

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
    const ballotStyle = find(
      election.ballotStyles,
      (bs) => bs.id === props.ballotStyleId
    );
    const split = find(precinct.splits, (ps) =>
      ballotStyleHasPrecinctOrSplit(ballotStyle, { precinct, split: ps })
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
        ? [{ ...props, isFederalOfficeOnly: true }]
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
