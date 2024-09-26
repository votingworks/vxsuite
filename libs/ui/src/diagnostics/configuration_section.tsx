import {
  BallotStyle,
  Election,
  ElectionDefinition,
  LanguageCode,
  MarkThresholds,
  PrecinctSelection,
  formatElectionHashes,
  getPrecinctById,
} from '@votingworks/types';
import { assert, assertDefined, iter } from '@votingworks/basics';
import { getBallotStyleGroups, format } from '@votingworks/utils';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export interface ConfigurationSectionProps {
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  expectPrecinctSelection?: boolean;
  markThresholds?: MarkThresholds;
  precinctSelection?: PrecinctSelection;
}

function getPrecinctSelectionName(
  precinctSelection: PrecinctSelection,
  election: Election
): string {
  if (precinctSelection.kind === 'AllPrecincts') {
    return 'All Precincts';
  }

  const { precinctId } = precinctSelection;
  const precinct = getPrecinctById({ election, precinctId });
  assert(precinct);
  return precinct.name;
}

function getBallotStyleGroupForPrecinct(
  election: Election,
  precinctSelection?: PrecinctSelection
): Map<string, Set<BallotStyle>> {
  if (!precinctSelection || precinctSelection.kind === 'AllPrecincts') {
    return getBallotStyleGroups(election.ballotStyles);
  }

  const { precinctId } = precinctSelection;
  return getBallotStyleGroups(
    election.ballotStyles.filter((bs) => bs.precincts.includes(precinctId))
  );
}

function getBallotStylesConfigurationDetails(
  election: Election,
  precinctSelection?: PrecinctSelection
): string[] {
  const ballotStyleGroups = getBallotStyleGroupForPrecinct(
    election,
    precinctSelection
  );

  return iter(ballotStyleGroups.keys())
    .map((bsParentId) => {
      const ballotStylesInGroup = assertDefined(
        ballotStyleGroups.get(bsParentId)
      );
      const languageCodes = new Set<LanguageCode>();
      // If there is only one language per ballot style we don't need to display it.
      if (ballotStylesInGroup.size <= 1) {
        return bsParentId;
      }
      for (const bs of ballotStylesInGroup) {
        if (bs.languages) {
          for (const lang of bs.languages) languageCodes.add(lang);
        }
      }
      return `${bsParentId} [${iter(languageCodes)
        .map((code) =>
          format.languageDisplayName({
            languageCode: code,
            displayLanguageCode: LanguageCode.ENGLISH,
          })
        )
        .join(', ')}]`;
    })
    .toArray();
}

function truncate(num: number, decimals: number): number {
  return Math.trunc(num * 10 ** decimals) / 10 ** decimals;
}

export function ConfigurationSection({
  electionDefinition,
  electionPackageHash,
  expectPrecinctSelection,
  markThresholds,
  precinctSelection,
}: ConfigurationSectionProps): JSX.Element {
  if (!electionDefinition) {
    return (
      <section>
        <H2>Configuration</H2>
        <P>
          <InfoIcon /> No election currently loaded on device.
        </P>
      </section>
    );
  }
  const { election } = electionDefinition;

  return (
    <section>
      <H2>Configuration</H2>
      <P>
        <SuccessIcon /> Election: {election.title},{' '}
        {formatElectionHashes(
          electionDefinition.ballotHash,
          assertDefined(electionPackageHash)
        )}
      </P>
      {expectPrecinctSelection &&
        (precinctSelection ? (
          <P>
            <SuccessIcon /> Precinct:{' '}
            {getPrecinctSelectionName(precinctSelection, election)}
          </P>
        ) : (
          <P>
            <WarningIcon /> No precinct selected.
          </P>
        ))}
      {!(expectPrecinctSelection && !precinctSelection) && (
        <P>
          <SuccessIcon /> Ballot Styles:{' '}
          {getBallotStylesConfigurationDetails(
            election,
            precinctSelection
          ).join(', ')}
        </P>
      )}
      {markThresholds?.definite && (
        <P>
          <SuccessIcon /> Mark Threshold: {truncate(markThresholds.definite, 4)}
        </P>
      )}
      {markThresholds?.writeInTextArea && (
        <P>
          <SuccessIcon /> Write-in Threshold:{' '}
          {truncate(markThresholds.writeInTextArea, 4)}
        </P>
      )}
    </section>
  );
}
