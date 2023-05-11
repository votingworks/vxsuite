import { assert, assertDefined } from '@votingworks/basics';
import React, { useCallback, useContext, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  AnyContest,
  Dictionary,
  ContestVoteOption,
  ContestOptionTally,
  ContestTally,
  ManualTally,
  TallyCategory,
  VotingMethod,
  ContestId,
  Candidate,
  Election,
  getContestDistrictName,
} from '@votingworks/types';
import { Button, Prose, Table, TD, Text, LinkButton } from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';

import { LogEventId } from '@votingworks/logging';
import { ManualDataPrecinctScreenProps } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { getContestsForPrecinct } from '../utils/election';
import { TextInput } from '../components/text_input';
import {
  convertTalliesByPrecinctToFullManualTally,
  getEmptyManualTalliesByPrecinct,
  getTotalNumberOfBallots,
} from '../utils/manual_tallies';
import { isManuallyAdjudicatedWriteInCandidate } from '../utils/write_ins';
import {
  getWriteInCandidates,
  addWriteInCandidate as addWriteInCandidateApi,
} from '../api';

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
  onRemove,
  children,
  testId,
}: {
  label: string | React.ReactNode;
  onRemove?: VoidFunction;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <tr data-testid={testId}>
      <TD narrow>{children}</TD>
      <TD>{label}</TD>
      <TD textAlign="right">
        {onRemove && (
          <Button onPress={onRemove} small>
            Remove
          </Button>
        )}
      </TD>
    </tr>
  );
}

function AddWriteInRow({
  addWriteInCandidate,
  contestId,
  disallowedCandidateNames,
}: {
  addWriteInCandidate: (name: string) => void;
  contestId: ContestId;
  disallowedCandidateNames: string[];
}): JSX.Element {
  const [isAddingWriteIn, setIsAddingWriteIn] = useState(false);
  const [writeInName, setWriteInName] = useState('');
  const onAdd = useCallback(() => {
    addWriteInCandidate(writeInName);
    setIsAddingWriteIn(false);
    setWriteInName('');
  }, [addWriteInCandidate, writeInName]);

  return (
    <tr>
      <TD narrow textAlign="center">
        {isAddingWriteIn && (
          <Button
            small
            variant="primary"
            onPress={onAdd}
            disabled={
              writeInName.length === 0 ||
              disallowedCandidateNames.includes(writeInName)
            }
          >
            Add
          </Button>
        )}
      </TD>
      {isAddingWriteIn ? (
        <React.Fragment>
          <TD>
            <TextInput
              defaultValue=""
              data-testid={`${contestId}-write-in-input`}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setWriteInName(e.target.value)
              }
            />
          </TD>
          <TD textAlign="right">
            <Button small onPress={() => setIsAddingWriteIn(false)}>
              Cancel
            </Button>
          </TD>
        </React.Fragment>
      ) : (
        <TD colSpan={2}>
          <Button small onPress={() => setIsAddingWriteIn(true)}>
            Add Write-In Candidate
          </Button>
        </TD>
      )}
    </tr>
  );
}

// While we're holding data internally in this component tallies can be stored
// as strings or as numbers to allow the user to delete a "0" in the text boxes.
// When the data is saved empty strings are converted back to 0s.
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
  readonly contest: AnyContest;
  readonly tallies: Dictionary<TempContestOptionTally>;
  readonly metadata: TempContestTallyMeta;
}

interface TempManualTally {
  readonly contestTallies: Dictionary<TempContestTally>;
  readonly numberOfBallotsCounted: number;
}

function getNumericalValueForTally(tally: number | EmptyValue): number {
  if (tally === '') {
    return 0;
  }
  return tally;
}

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
        tally: getNumericalValueForTally(optionTally.tally),
      };
    }
    convertedContestTallies[contestId] = {
      ...contestTally,
      tallies: convertedOptionTallies,
      metadata: {
        ballots: getNumericalValueForTally(contestTally.metadata.ballots),
        undervotes: getNumericalValueForTally(contestTally.metadata.undervotes),
        overvotes: getNumericalValueForTally(contestTally.metadata.overvotes),
      },
    };
  }
  return convertedContestTallies;
}

// Re-calculates the total number of ballots in each contest to create a
// manual tally from contest tallies
export function getManualTallyFromContestTallies(
  contestTallies: Dictionary<TempContestTally>,
  election: Election
): TempManualTally {
  const numberBallotsInPrecinct = getTotalNumberOfBallots(
    convertContestTallies(contestTallies),
    election
  );
  return {
    numberOfBallotsCounted: numberBallotsInPrecinct,
    contestTallies,
  };
}

export function getExpectedNumberOfBallotsForContestTally(
  contestTally: TempContestTally
): number {
  const numSeats =
    contestTally.contest.type === 'candidate' ? contestTally.contest.seats : 1;
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

// Recalculates the total number of ballots in a contest, which is necessary
// after an input field is changed or a manually added write-in candidate is removed
export function getContestTallyWithUpdatedNumberOfBallots(
  contestTally: TempContestTally
): TempContestTally {
  return {
    ...contestTally,
    metadata: {
      ...contestTally.metadata,
      ballots: getExpectedNumberOfBallotsForContestTally(contestTally),
    },
  };
}

export function getCandidatesFromContestTally(
  contestTally: TempContestTally
): Candidate[] {
  if (contestTally.contest.type !== 'candidate') return [];
  const contestOptions = Object.values(contestTally.tallies).map(
    (optionTally) => {
      assert(optionTally);
      return optionTally.option;
    }
  );
  return contestOptions as Candidate[];
}

export function getCandidateNamesFromContestTally(
  contestTally: TempContestTally
): string[] {
  const candidates = getCandidatesFromContestTally(contestTally);
  return candidates.map((candidate) => candidate.name);
}

export function ManualDataImportPrecinctScreen(): JSX.Element {
  const {
    electionDefinition,
    fullElectionManualTally: existingManualData,
    updateManualTally,
    manualTallyVotingMethod,
    auth,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const userRole = auth.user.role;
  const { election } = electionDefinition;
  const { precinctId: currentPrecinctId } =
    useParams<ManualDataPrecinctScreenProps>();
  const history = useHistory();

  const ballotType =
    existingManualData?.votingMethod ?? manualTallyVotingMethod;
  const initialTalliesByPrecinct: Dictionary<ManualTally> =
    existingManualData?.resultsByCategory.get(TallyCategory.Precinct) ||
    getEmptyManualTalliesByPrecinct(election);

  const currentPrecinct = election.precincts.find(
    (p) => p.id === currentPrecinctId
  );
  const [currentPrecinctTally, setCurrentPrecinctTally] =
    useState<TempManualTally>(
      assertDefined(initialTalliesByPrecinct[currentPrecinctId])
    );

  async function saveResults() {
    // Convert the temporary data structure that allows empty strings or
    // numbers for all tallies to fill in 0s for any empty strings.
    const convertedCurrentPrecinctTally: ManualTally = {
      ...currentPrecinctTally,
      contestTallies: convertContestTallies(
        currentPrecinctTally.contestTallies
      ),
    };

    const manualTally = convertTalliesByPrecinctToFullManualTally(
      {
        ...initialTalliesByPrecinct,
        [currentPrecinctId]: convertedCurrentPrecinctTally,
      },
      election,
      ballotType,
      new Date()
    );
    await logger.log(LogEventId.ManualTallyDataEdited, userRole, {
      disposition: 'success',
      message: `Manually entered tally data added or edited for precinct: ${currentPrecinctId}`,
      numberOfBallotsInPrecinct: currentPrecinctTally.numberOfBallotsCounted,
      precinctId: currentPrecinctId,
    });
    await updateManualTally(manualTally);
    history.push(routerPaths.manualDataImport);
  }

  function getValueForInput(
    contestId: ContestId,
    dataKey: string
  ): number | EmptyValue {
    assert(currentPrecinctTally);
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
    assert(currentPrecinctTally);
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
    // Update the total number of ballots for this contest
    newContestTally =
      getContestTallyWithUpdatedNumberOfBallots(newContestTally);
    setCurrentPrecinctTally(
      // Create tally with updated total number of ballots for the entire tally
      getManualTallyFromContestTallies(
        {
          ...currentPrecinctTally.contestTallies,
          [contestId]: newContestTally,
        },
        election
      )
    );
  }

  const currentContests = getContestsForPrecinct(election, currentPrecinctId);

  const votingMethodName =
    ballotType === VotingMethod.Absentee ? 'Absentee' : 'Precinct';

  if (currentPrecinct === undefined) {
    return (
      <NavigationScreen>
        <Prose>
          Error: Could not find precinct {currentPrecinctId}.{' '}
          <LinkButton to={routerPaths.manualDataImport}>
            Back to Index
          </LinkButton>
        </Prose>
      </NavigationScreen>
    );
  }

  if (!currentPrecinctTally) {
    return (
      <NavigationScreen>
        <br />
      </NavigationScreen>
    );
  }

  return (
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
          if (contest.type === 'candidate' && contest.partyId) {
            const party = election.parties.find(
              (p) => p.id === contest.partyId
            );
            if (party) {
              contestTitle = `${contestTitle} - ${party.fullName}`;
            }
          }

          const contestTally = currentPrecinctTally.contestTallies[contest.id];
          assert(contestTally);

          return (
            <ContestData key={contest.id}>
              <Text small>{getContestDistrictName(election, contest)}</Text>
              <h3>{contestTitle}</h3>
              <Table borderTop condensed>
                <tbody>
                  {contest.type === 'candidate' &&
                    getCandidatesFromContestTally(contestTally).map(
                      (candidate) => (
                        <ContestDataRow
                          key={candidate.id}
                          label={`${candidate.name}${
                            candidate.isWriteIn ? ' (write-in)' : ''
                          }`}
                          onRemove={
                            isManuallyAdjudicatedWriteInCandidate(candidate)
                              ? () =>
                                  setCandidateToRemove({
                                    candidate,
                                    contest,
                                  })
                              : undefined
                          }
                          testId={`${contest.id}-${candidate.id}`}
                        >
                          <TallyInput
                            name={`${contest.id}-${candidate.id}`}
                            data-testid={`${contest.id}-${candidate.id}-input`}
                            value={getValueForInput(contest.id, candidate.id)}
                            onChange={(e) =>
                              updateContestData(contest.id, candidate.id, e)
                            }
                          />
                        </ContestDataRow>
                      )
                    )}
                  {contest.type === 'candidate' && contest.allowWriteIns && (
                    <AddWriteInRow
                      addWriteInCandidate={(name) =>
                        addWriteInCandidate(contest.id, name)
                      }
                      contestId={contest.id}
                      disallowedCandidateNames={getCandidateNamesFromContestTally(
                        contestTally
                      )}
                    />
                  )}
                  {contest.type === 'yesno' && (
                    <React.Fragment>
                      <ContestDataRow label="Yes" testId={`${contest.id}-yes`}>
                        <TallyInput
                          name={`${contest.id}-yes`}
                          data-testid={`${contest.id}-yes-input`}
                          value={getValueForInput(contest.id, 'yes')}
                          onChange={(e) =>
                            updateContestData(contest.id, 'yes', e)
                          }
                        />
                      </ContestDataRow>
                      <ContestDataRow label="No" testId={`${contest.id}-no`}>
                        <TallyInput
                          name={`${contest.id}-no`}
                          data-testid={`${contest.id}-no-input`}
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
                    testId={`${contest.id}-undervotes`}
                  >
                    <TallyInput
                      name={`${contest.id}-undervotes`}
                      data-testid={`${contest.id}-undervotes-input`}
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
                    testId={`${contest.id}-overvotes`}
                  >
                    <TallyInput
                      name={`${contest.id}-overvotes`}
                      data-testid={`${contest.id}-overvotes-input`}
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
                    <TD colSpan={2}>
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
          <Button variant="primary" onPress={saveResults}>
            Save {votingMethodName} Results for {currentPrecinct.name}
          </Button>
        </p>
      </Prose>
    </NavigationScreen>
  );
}
