import {
  BallotStyleGroup,
  Election,
  ElectionDefinition,
  MarkThresholds,
  PrecinctSelection,
  formatElectionHashes,
  getPrecinctById,
} from '@votingworks/types';
import { assert, assertDefined, iter } from '@votingworks/basics';
import { format, getGroupedBallotStyles } from '@votingworks/utils';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';
import { Table } from '../table';

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
): BallotStyleGroup[] {
  if (!precinctSelection || precinctSelection.kind === 'AllPrecincts') {
    return getGroupedBallotStyles(election.ballotStyles);
  }

  const { precinctId } = precinctSelection;
  return getGroupedBallotStyles(
    election.ballotStyles.filter((bs) => bs.precincts.includes(precinctId))
  );
}

function truncate(num: number, decimals: number): number {
  return Math.trunc(num * 10 ** decimals) / 10 ** decimals;
}

export interface BallotStylesDetailSectionProps {
  election: Election;
  precinctSelection?: PrecinctSelection;
}

function BallotStylesSection({
  election,
  precinctSelection,
}: BallotStylesDetailSectionProps): JSX.Element {
  const ballotStyleGroups = getBallotStyleGroupForPrecinct(
    election,
    precinctSelection
  );
  const isSingleLanguage = ballotStyleGroups.every(
    (bs) => bs.ballotStyles.length === 1
  );
  if (isSingleLanguage) {
    return (
      <P>
        <SuccessIcon /> Ballot Styles:{' '}
        {election.ballotStyles.map((bs) => bs.id).join(', ')}
      </P>
    );
  }

  return (
    <section style={{ marginBottom: '0.5rem' }}>
      <P>
        <SuccessIcon /> Ballot Styles:
      </P>
      <Table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Languages</th>
          </tr>
        </thead>
        <tbody>
          {ballotStyleGroups.map((group) => {
            const ballotStylesInGroup = group.ballotStyles;
            const languages = iter(ballotStylesInGroup)
              .flatMap(
                (bs) =>
                  /* istanbul ignore next - unexpected condition */
                  bs.languages || []
              )
              .map((code) =>
                format.languageDisplayName({
                  languageCode: code,
                  displayLanguageCode: 'en',
                })
              )
              .join(', ');
            return (
              <tr key={group.id}>
                <td>{group.id}</td>
                <td>{languages}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
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
          <InfoIcon /> No election loaded on device
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
        <BallotStylesSection
          election={election}
          precinctSelection={precinctSelection}
        />
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
