import { Optional, assert, assertDefined, find } from '@votingworks/basics';
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

function normalizeWriteInName(name: string) {
  return name.toLowerCase().trim();
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
              disallowedCandidateNames.includes(
                normalizeWriteInName(writeInName)
              )
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

interface TempWriteInCandidate {
  readonly id: string;
  readonly name: string;
  readonly contestId: string;
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

  const getWriteInCandidatesQuery = getWriteInCandidates.useQuery();
  const addWriteInCandidateMutation = addWriteInCandidateApi.useMutation();

  const ballotType =
    existingManualData?.votingMethod ?? manualTallyVotingMethod;
  const initialTalliesByPrecinct: Dictionary<ManualTally> =
    existingManualData?.resultsByCategory.get(TallyCategory.Precinct) ||
    getEmptyManualTalliesByPrecinct(election);

  const currentPrecinct = election.precincts.find(
    (p) => p.id === currentPrecinctId
  );
  const [currentPrecinctTally, setCurrentPrecinctTally] = useState<
    Optional<TempManualTally>
  >(initialTalliesByPrecinct[currentPrecinctId]);

  const [tempWriteInCandidates, setTempWriteInCandidates] = useState<
    TempWriteInCandidate[]
  >([]);

  async function saveResults() {
    assert(currentPrecinctTally);
    // replace temporary tally values with the numeric values we'll save
    const finalPrecinctTally: ManualTally = {
      ...currentPrecinctTally,
      contestTallies: convertContestTallies(
        currentPrecinctTally.contestTallies
      ),
    };

    // remove any temporary write-in candidates with 0 votes
    const nonZeroTempWriteInCandidates: TempWriteInCandidate[] = [];
    for (const writeInCandidate of tempWriteInCandidates) {
      const numVotes =
        finalPrecinctTally.contestTallies[writeInCandidate.contestId]?.tallies[
          writeInCandidate.id
        ]?.tally;

      if (!numVotes) {
        delete finalPrecinctTally.contestTallies[writeInCandidate.contestId]
          ?.tallies[writeInCandidate.id];
      } else {
        nonZeroTempWriteInCandidates.push(writeInCandidate);
      }
    }
    try {
      // add temporary write-in candidates to backend, get ids
      const writeInCandidateRecords = await Promise.all(
        nonZeroTempWriteInCandidates.map((candidate) =>
          addWriteInCandidateMutation.mutateAsync({
            contestId: candidate.contestId,
            name: candidate.name,
          })
        )
      );

      // edit the precinctTally to use the new ids
      for (const tempWriteInCandidate of nonZeroTempWriteInCandidates) {
        const oldId = tempWriteInCandidate.id;
        const newId = find(
          writeInCandidateRecords,
          (writeInCandidateRecord) =>
            writeInCandidateRecord.name === tempWriteInCandidate.name
        ).id;

        const contestTally =
          finalPrecinctTally.contestTallies[tempWriteInCandidate.contestId];
        assert(contestTally);
        const optionTally = contestTally.tallies[oldId];
        assert(optionTally);
        contestTally.tallies[newId] = {
          ...optionTally,
          option: {
            ...(optionTally.option as Candidate),
            id: newId,
          },
        };
        delete contestTally.tallies[oldId];
      }
    } catch {
      // Handled by default query client error handling
    }

    const newFullManualTally = convertTalliesByPrecinctToFullManualTally(
      {
        ...initialTalliesByPrecinct,
        [currentPrecinctId]: finalPrecinctTally,
      },
      election,
      ballotType,
      new Date()
    );
    await logger.log(LogEventId.ManualTallyDataEdited, userRole, {
      disposition: 'success',
      message: `Manually entered tally data added or edited for precinct: ${currentPrecinctId}`,
      numberOfBallotsInPrecinct: finalPrecinctTally.numberOfBallotsCounted,
      precinctId: currentPrecinctId,
    });
    await updateManualTally(newFullManualTally);
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

  /**
   * Takes a `contestTally` with update option tallies and recalculates the
   * ballot count for that contest and the ballot count for the entire
   * precinct tally.
   */
  function updateCurrentPrecinctTally(
    contestId: ContestId,
    contestTally: TempContestTally
  ) {
    assert(currentPrecinctTally);
    setCurrentPrecinctTally(
      // Create tally with updated total number of ballots for the entire tally
      getManualTallyFromContestTallies(
        {
          ...currentPrecinctTally.contestTallies,
          // Create contest tally with updated number of ballots for the contest
          [contestId]: getContestTallyWithUpdatedNumberOfBallots(contestTally),
        },
        election
      )
    );
  }

  function updateContestData(
    contestId: ContestId,
    dataKey: string,
    event: React.FormEvent<HTMLInputElement>,
    candidateName?: string
  ) {
    assert(currentPrecinctTally);
    const contestTally = currentPrecinctTally.contestTallies[contestId];
    assert(contestTally);
    const stringValue = event.currentTarget.value;
    // eslint-disable-next-line vx/gts-safe-number-parse
    const numericalValue = Number(stringValue);
    if (Number.isNaN(numericalValue)) {
      return;
    }
    const valueToSave = stringValue === '' ? '' : numericalValue;
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
        const option = tally
          ? tally.option
          : {
              id: dataKey,
              isWriteIn: true,
              name: assertDefined(candidateName),
            };
        newContestTally = {
          ...contestTally,
          tallies: {
            ...contestTally.tallies,
            [dataKey]: {
              option,
              tally: valueToSave,
            },
          },
        };
      }
    }

    updateCurrentPrecinctTally(contestId, newContestTally);
  }

  function addTempWriteInCandidate(name: string, contestId: string): void {
    setTempWriteInCandidates([
      ...tempWriteInCandidates,
      {
        id: `write-in-(${name})-temp`,
        name,
        contestId,
      },
    ]);
  }

  function removeTempWriteInCandidate(id: string, contestId: string): void {
    setTempWriteInCandidates(tempWriteInCandidates.filter((c) => c.id !== id));

    // remove temp candidate from contest and recompute the ballot counts
    assert(currentPrecinctTally);
    const contestTally = currentPrecinctTally.contestTallies[contestId];
    assert(contestTally);
    delete contestTally?.tallies[id];
    updateCurrentPrecinctTally(contestId, contestTally);
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

  if (!currentPrecinctTally || !getWriteInCandidatesQuery.isSuccess) {
    return (
      <NavigationScreen>
        <br />
      </NavigationScreen>
    );
  }

  const writeInCandidates = getWriteInCandidatesQuery.data;

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

          const contestWriteInCandidates = writeInCandidates.filter(
            ({ contestId }) => contestId === contest.id
          );
          const contestTempWriteInCandidates = tempWriteInCandidates.filter(
            ({ contestId }) => contestId === contest.id
          );
          const disallowedNewWriteInCandidateNames =
            contest.type === 'candidate'
              ? [
                  ...contest.candidates,
                  ...contestWriteInCandidates,
                  ...contestTempWriteInCandidates,
                ].map(({ name }) => normalizeWriteInName(name))
              : [];

          return (
            <ContestData key={contest.id}>
              <Text small>{getContestDistrictName(election, contest)}</Text>
              <h3>{contestTitle}</h3>
              <Table borderTop condensed>
                <tbody>
                  {contest.type === 'candidate' && (
                    <React.Fragment>
                      {contest.candidates
                        .filter((c) => !c.isWriteIn)
                        .map((candidate) => (
                          <ContestDataRow
                            key={candidate.id}
                            label={candidate.name}
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
                        ))}
                      {contestWriteInCandidates.map((candidate) => (
                        <ContestDataRow
                          key={candidate.id}
                          label={`${candidate.name} (write-in)`}
                          testId={`${contest.id}-${candidate.id}`}
                        >
                          <TallyInput
                            name={`${contest.id}-${candidate.id}`}
                            data-testid={`${contest.id}-${candidate.id}-input`}
                            value={getValueForInput(contest.id, candidate.id)}
                            onChange={(e) =>
                              updateContestData(
                                contest.id,
                                candidate.id,
                                e,
                                candidate.name
                              )
                            }
                          />
                        </ContestDataRow>
                      ))}
                      {contestTempWriteInCandidates.map((candidate) => (
                        <ContestDataRow
                          key={candidate.id}
                          label={`${candidate.name} (write-in)`}
                          testId={`${contest.id}-${candidate.id}`}
                          onRemove={() => {
                            removeTempWriteInCandidate(
                              candidate.id,
                              contest.id
                            );
                          }}
                        >
                          <TallyInput
                            name={`${contest.id}-${candidate.id}`}
                            data-testid={`${contest.id}-${candidate.id}-input`}
                            value={getValueForInput(contest.id, candidate.id)}
                            onChange={(e) =>
                              updateContestData(
                                contest.id,
                                candidate.id,
                                e,
                                candidate.name
                              )
                            }
                          />
                        </ContestDataRow>
                      ))}
                    </React.Fragment>
                  )}
                  {contest.type === 'candidate' && contest.allowWriteIns && (
                    <AddWriteInRow
                      addWriteInCandidate={(name) =>
                        addTempWriteInCandidate(name, contest.id)
                      }
                      contestId={contest.id}
                      disallowedCandidateNames={
                        disallowedNewWriteInCandidateNames
                      }
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
