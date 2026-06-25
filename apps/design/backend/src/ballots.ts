import {
  BallotType,
  BaseBallotProps,
  centralScanningPollingPlaceId,
  CENTRAL_SCANNING_POLLING_PLACE_NAME,
  Election,
  hasSplits,
  PollingPlace,
  pollingPlacesGenerateFromPrecincts,
  SoftwareVersion,
  UiStringsPackage,
  YesNoContest,
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
      /* istanbul ignore next */
      throwIllegalValue(jurisdiction.stateCode);
    }
  }
}

function centralScanningPollingPlace(election: Election): PollingPlace {
  return {
    id: centralScanningPollingPlaceId(election.id),
    name: CENTRAL_SCANNING_POLLING_PLACE_NAME,
    type: 'absentee',
    precincts: Object.fromEntries(
      election.precincts.map((precinct) => [precinct.id, { type: 'whole' }])
    ),
  };
}

export function addPollingPlacesForExport(
  election: Election,
  jurisdiction: Jurisdiction
): Election {
  const stateFeatures = getStateFeaturesConfig(jurisdiction);

  if (stateFeatures.EDIT_POLLING_PLACES) {
    return election;
  }

  // Generate election day polling places from precincts and unless
  // this state allows elections with no absentee polling places, add a single
  // Central Scanning absentee place covering all precincts.
  const pollingPlaces = pollingPlacesGenerateFromPrecincts(
    election.precincts,
    'election_day',
    (p) => `${p.id}-polling-place`
  );
  return {
    ...election,
    pollingPlaces: stateFeatures.OMIT_ABSENTEE_POLLING_PLACES
      ? pollingPlaces
      : [...pollingPlaces, centralScanningPollingPlace(election)],
  };
}

export function formatElectionForExport(
  election: Election,
  ballotStrings: UiStringsPackage,
  softwareVersion: SoftwareVersion
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

  // v4.0 converts multi-option yesno contests to candidate contests (dropping
  // the description), so we preserve it in additionalHashInput. v4.1+ exports
  // them natively with all options, so no workaround is needed.
  const contestDescriptionsForContestsWithAdditionalOptions =
    softwareVersion === 'v4.0'
      ? Object.fromEntries(
          election.contests
            .filter(
              (contest): contest is YesNoContest =>
                contest.type === 'yesno' && contest.options.length > 2
            )
            .map((contest) => [contest.id, contest.description])
        )
      : {};

  const additionalHashInput = {
    precinctSplitSeals: Object.fromEntries(sealOverrideBySplit),
    precinctSplitSignatureImages: Object.fromEntries(signatureImageBySplit),
    contestDescriptionsForContestsWithAdditionalOptions,
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
      /* istanbul ignore next */
      throwIllegalValue(templateId);
    }
  }
}
