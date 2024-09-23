import {
  Election,
  ElectionDefinition,
  MarkThresholds,
  PrecinctSelection,
  formatElectionHashes,
  getPrecinctById,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
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

function getBallotStyleIds(
  election: Election,
  precinctSelection?: PrecinctSelection
): string[] {
  if (!precinctSelection || precinctSelection.kind === 'AllPrecincts') {
    return election.ballotStyles.map((bs) => bs.id);
  }

  const { precinctId } = precinctSelection;
  return election.ballotStyles
    .filter((bs) => bs.precincts.includes(precinctId))
    .map((bs) => bs.id);
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
          {getBallotStyleIds(election, precinctSelection).join(', ')}
        </P>
      )}
      {markThresholds?.definite && (
        <P>
          <SuccessIcon /> Mark Threshold: {markThresholds.definite}
        </P>
      )}
      {markThresholds?.writeInTextArea && (
        <P>
          <SuccessIcon /> Write-in Threshold: {markThresholds.writeInTextArea}
        </P>
      )}
    </section>
  );
}
