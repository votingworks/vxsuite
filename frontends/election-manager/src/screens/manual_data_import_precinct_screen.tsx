import { assert } from '@votingworks/utils';
import React, { useContext, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  CandidateContest,
  Contest,
  Dictionary,
  expandEitherNeitherContests,
  ContestVoteOption,
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  ExternalTallySourceType,
  TallyCategory,
  VotingMethod,
  ContestId,
} from '@votingworks/types';

import { Prose, Table, TD, Text } from '@votingworks/ui';

import { LogEventId } from '@votingworks/logging';
import { ManualDataPrecinctScreenProps } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';
import { Button } from '../components/button';
import { LinkButton } from '../components/link_button';

import { NavigationScreen } from '../components/navigation_screen';
import {
  getContestsForPrecinct,
  getAllPossibleCandidatesForCandidateContest,
} from '../utils/election';
import { TextInput } from '../components/text_input';
import {
  convertTalliesByPrecinctToFullExternalTally,
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
  getTotalNumberOfBallots,
} from '../utils/external_tallies';

const MANUAL_DATA_NAME = 'Manually Added Data';

const TallyInput = styled(TextInput)`
  width: 4em;
  text-align: center;
`;

export const ContestData = styled.div`
  margin: 2rem 0 3rem;
  p:first-child {
    margin-bottom: 0;
  }
  h3 {
    margin-top: 0;
    margin-bottom: 0.5em;
    & + p {
      margin-top: -0.8em;
      margin-bottom: 0.25em;
    }
    & + table {
      margin-top: -0.5em;
    }
  }
`;

function ContestDataRow({
  label,
  children,
}: {
  label: string | React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <TD narrow>{children}</TD>
      <TD>{label}</TD>
    </tr>
  );
}

// While we're holding data internally in this component tallys can be stored
// as strings or as numbers to allow the user to delete a "0" in the text boxes.
// When the data is saved empty strings are convertted back to 0s.
type EmptyValue = '';
interface TempContestOptionTally {
  readonly option: ContestVoteOption;
  readonly tally: number | EmptyValue;
}

interface TempContestTallyMeta {
  readonly ballots: number | EmptyValue;
  readonly undervotes: number | EmptyValue;
  readonly overvotes: number | EmptyValue;
}
interface TempContestTally {
  readonly contest: Contest;
  readonly tallies: Dictionary<TempContestOptionTally>;
  readonly metadata: TempContestTallyMeta;
}

interface TempExternalTally {
  readonly contestTallies: Dictionary<TempContestTally>;
  readonly numberOfBallotsCounted: number;
}

function getNumericalValueForTally(tally: number | EmptyValue): number {
  if (tally === '') {
    return 0;
  }
  return tally;
}

export function getExpectedNumberOfBallotsForContestTally(
  contestTally: TempContestTally
): number {
  const numSeats =
    contestTally.contest.type === 'candidate'
      ? (contestTally.contest as CandidateContest).seats
      : 1;
  const sumOfCandidateVotes = Object.values(contestTally.tallies).reduce(
    (prevValue, optionTally) =>
      prevValue +
      (optionTally ? getNumericalValueForTally(optionTally.tally) : 0),
    0
  );
  return Math.ceil(
    (getNumericalValueForTally(contestTally.metadata.overvotes) +
      getNumericalValueForTally(contestTally.metadata.undervotes) +
      sumOfCandidateVotes) /
      numSeats
  );
}

export function ManualDataImportPrecinctScreen(): JSX.Element {
  const {
    electionDefinition,
    fullElectionExternalTallies,
    saveExternalTallies,
    currentUserSession,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth) check permissions for adding manual tally data
  const currentUserType = currentUserSession.type;
  const { election } = electionDefinition;
  // TODO export the type for this somewhere
  const { precinctId: currentPrecinctId } =
    useParams<ManualDataPrecinctScreenProps>();
  const history = useHistory();

  const currentPrecinct = election.precincts.find(
    (p) => p.id === currentPrecinctId
  );
  if (currentPrecinct === undefined) {
    return (
      <Prose>
        Error: Could not find precinct {currentPrecinctId}.{' '}
        <LinkButton to={routerPaths.manualDataImport}>Back to Index</LinkButton>
      </Prose>
    );
  }
  const existingManualDataTallies = fullElectionExternalTallies.filter(
    (t) => t.source === ExternalTallySourceType.Manual
  );
  const existingManualData =
    existingManualDataTallies.length === 1
      ? existingManualDataTallies[0]
      : undefined;
  const existingTalliesByPrecinct = existingManualData?.resultsByCategory.get(
    TallyCategory.Precinct
  );
  const talliesByPrecinct: Dictionary<TempExternalTally> =
    existingTalliesByPrecinct ?? getEmptyExternalTalliesByPrecinct(election);

  const initialPrecinctTally =
    talliesByPrecinct[currentPrecinctId] ?? getEmptyExternalTally();
  const [currentPrecinctTally, setCurrentPrecinctTally] =
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useState(initialPrecinctTally);

  const ballotType = existingManualData?.votingMethod || VotingMethod.Precinct;

  // Convert internal structure of contest data that allows for empty strings, to the regular
  // type by mapping any empty string values to zeros.
  function convertContestTallies(
    contestTallies: Dictionary<TempContestTally>
  ): Dictionary<ContestTally> {
    const convertedContestTallies: Dictionary<ContestTally> = {};
    for (const contestId of Object.keys(contestTallies)) {
      const contestTally = contestTallies[contestId];
      assert(contestTally);
      const convertedOptionTallies: Dictionary<ContestOptionTally> = {};
      for (const optionId of Object.keys(contestTally.tallies)) {
        const optionTally = contestTally.tallies[optionId];
        assert(optionTally);
        convertedOptionTallies[optionId] = {
          ...optionTally,
          tally: optionTally.tally === '' ? 0 : optionTally.tally,
        };
      }
      convertedContestTallies[contestId] = {
        ...contestTally,
        tallies: convertedOptionTallies,
        metadata: {
          ballots:
            contestTally.metadata.ballots === ''
              ? 0
              : contestTally.metadata.ballots,
          undervotes:
            contestTally.metadata.undervotes === ''
              ? 0
              : contestTally.metadata.undervotes,
          overvotes:
            contestTally.metadata.overvotes === ''
              ? 0
              : contestTally.metadata.overvotes,
        },
      };
    }
    return convertedContestTallies;
  }

  async function handleImportingData() {
    // Turn the precinct tallies into a CSV SEMS file
    // Save that file as the external results file with a name implied manual data entry happened

    // Convert the temporary data structure that allows empty strings or numbers for all tallys to fill in 0s for
    // any empty strings.
    const convertedTalliesByPrecinct: Dictionary<ExternalTally> = {};
    for (const precinctId of Object.keys(talliesByPrecinct)) {
      const precinctTally =
        precinctId === currentPrecinctId
          ? currentPrecinctTally
          : talliesByPrecinct[precinctId];
      assert(precinctTally);
      convertedTalliesByPrecinct[precinctId] = {
        ...precinctTally,
        contestTallies: convertContestTallies(precinctTally.contestTallies),
      };
    }

    const externalTally = convertTalliesByPrecinctToFullExternalTally(
      convertedTalliesByPrecinct,
      election,
      ballotType,
      ExternalTallySourceType.Manual,
      MANUAL_DATA_NAME,
      new Date()
    );
    await logger.log(LogEventId.ManualTallyDataEdited, currentUserType, {
      disposition: 'success',
      message: `Manually entered tally data added or edited for precinct: ${currentPrecinctId}`,
      numberOfBallotsInPrecinct: currentPrecinctTally.numberOfBallotsCounted,
      precinctId: currentPrecinctId,
    });
    // Don't modify any external tallies for non-manual data
    const newTallies = fullElectionExternalTallies.filter(
      (t) => t.source !== ExternalTallySourceType.Manual
    );
    // Add the new tally
    newTallies.push(externalTally);
    await saveExternalTallies(newTallies);
    history.push(routerPaths.manualDataImport);
  }

  function getValueForInput(
    contestId: ContestId,
    dataKey: string
  ): number | EmptyValue {
    const contestTally = currentPrecinctTally.contestTallies[contestId];
    assert(contestTally);
    switch (dataKey) {
      case 'numBallots':
        return contestTally.metadata.ballots;
      case 'overvotes':
        return contestTally.metadata.overvotes;
      case 'undervotes':
        return contestTally.metadata.undervotes;
      default:
        return contestTally.tallies[dataKey]?.tally ?? 0;
    }
  }

  function updateContestData(
    contestId: ContestId,
    dataKey: string,
    event: React.FormEvent<HTMLInputElement>
  ) {
    const contestTally = currentPrecinctTally.contestTallies[contestId];
    assert(contestTally);
    const stringValue = event.currentTarget.value;
    // eslint-disable-next-line vx/gts-safe-number-parse
    let numericalValue = parseInt(stringValue, 10);
    if (stringValue === '') {
      numericalValue = 0;
    }
    const valueToSave = stringValue === '' ? '' : numericalValue;
    if (Number.isNaN(numericalValue)) {
      return;
    }
    let newContestTally = contestTally;
    switch (dataKey) {
      case 'overvotes':
        newContestTally = {
          ...contestTally,
          metadata: {
            ...contestTally.metadata,
            overvotes: valueToSave,
          },
        };
        break;
      case 'undervotes':
        newContestTally = {
          ...contestTally,
          metadata: {
            ...contestTally.metadata,
            undervotes: valueToSave,
          },
        };
        break;
      default: {
        const tally = contestTally.tallies[dataKey];
        assert(tally);
        newContestTally = {
          ...contestTally,
          tallies: {
            ...contestTally.tallies,
            [dataKey]: {
              option: tally.option,
              tally: valueToSave,
            },
          },
        };
      }
    }
    // Update the total number of ballots for this contest.
    const expectedNumberOfBallots =
      getExpectedNumberOfBallotsForContestTally(newContestTally);
    newContestTally = {
      ...newContestTally,
      metadata: {
        ...newContestTally.metadata,
        ballots: expectedNumberOfBallots,
      },
    };
    const newContestTallies: Dictionary<TempContestTally> = {
      ...currentPrecinctTally.contestTallies,
      [contestId]: newContestTally,
    };
    const numberBallotsInPrecinct = getTotalNumberOfBallots(
      convertContestTallies(newContestTallies),
      election
    );
    setCurrentPrecinctTally({
      numberOfBallotsCounted: numberBallotsInPrecinct,
      contestTallies: newContestTallies,
    });
  }

  const currentContests = expandEitherNeitherContests(
    getContestsForPrecinct(election, currentPrecinctId)
  );

  const votingMethodName =
    ballotType === VotingMethod.Absentee ? 'Absentee' : 'Precinct';

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose>
          <h1>
            <small>Manually Entered {votingMethodName} Results:</small>
            <br />
            {currentPrecinct.name}
          </h1>
          <p>Enter the number of votes for each contest option.</p>
          {currentContests.map((contest) => {
            let contestTitle = contest.title;
            if (contest.partyId) {
              const party = election.parties.find(
                (p) => p.id === contest.partyId
              );
              if (party) {
                contestTitle = `${contestTitle} - ${party.fullName}`;
              }
            }
            return (
              <ContestData key={contest.id}>
                <Text small>{contest.section}</Text>
                <h3>{contestTitle}</h3>
                <Table borderTop condensed>
                  <tbody>
                    {contest.type === 'candidate' &&
                      getAllPossibleCandidatesForCandidateContest(contest).map(
                        (candidate) => (
                          <ContestDataRow
                            key={candidate.id}
                            label={candidate.name}
                          >
                            <TallyInput
                              name={`${contest.id}-${candidate.id}`}
                              data-testid={`${contest.id}-${candidate.id}`}
                              value={getValueForInput(contest.id, candidate.id)}
                              onChange={(e) =>
                                updateContestData(contest.id, candidate.id, e)
                              }
                            />
                          </ContestDataRow>
                        )
                      )}
                    {contest.type === 'yesno' && (
                      <React.Fragment>
                        <ContestDataRow label="Yes">
                          <TallyInput
                            name={`${contest.id}-yes`}
                            data-testid={`${contest.id}-yes`}
                            value={getValueForInput(contest.id, 'yes')}
                            onChange={(e) =>
                              updateContestData(contest.id, 'yes', e)
                            }
                          />
                        </ContestDataRow>
                        <ContestDataRow label="No">
                          <TallyInput
                            name={`${contest.id}-no`}
                            data-testid={`${contest.id}-no`}
                            value={getValueForInput(contest.id, 'no')}
                            onChange={(e) =>
                              updateContestData(contest.id, 'no', e)
                            }
                          />
                        </ContestDataRow>
                      </React.Fragment>
                    )}
                    <ContestDataRow
                      label={
                        <Text as="span" small bold>
                          undervotes
                        </Text>
                      }
                    >
                      <TallyInput
                        name={`${contest.id}-undervotes`}
                        data-testid={`${contest.id}-undervotes`}
                        value={getValueForInput(contest.id, 'undervotes')}
                        onChange={(e) =>
                          updateContestData(contest.id, 'undervotes', e)
                        }
                      />
                    </ContestDataRow>
                    <ContestDataRow
                      label={
                        <Text as="span" small bold>
                          overvotes
                        </Text>
                      }
                    >
                      <TallyInput
                        name={`${contest.id}-overvotes`}
                        data-testid={`${contest.id}-overvotes`}
                        value={getValueForInput(contest.id, 'overvotes')}
                        onChange={(e) =>
                          updateContestData(contest.id, 'overvotes', e)
                        }
                      />
                    </ContestDataRow>
                  </tbody>
                  <tfoot>
                    <tr>
                      <TD textAlign="center">
                        <strong data-testid={`${contest.id}-numBallots`}>
                          {getValueForInput(contest.id, 'numBallots')}
                        </strong>
                      </TD>
                      <TD>
                        <strong>Total Ballots Cast</strong>
                      </TD>
                    </tr>
                  </tfoot>
                </Table>
              </ContestData>
            );
          })}
          <p>
            <LinkButton to={routerPaths.manualDataImport}>Cancel</LinkButton>{' '}
            <Button primary onPress={handleImportingData}>
              Save {votingMethodName} Results for {currentPrecinct.name}
            </Button>
          </p>
        </Prose>
      </NavigationScreen>
    </React.Fragment>
  );
}
