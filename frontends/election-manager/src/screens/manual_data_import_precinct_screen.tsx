import { assert } from '@votingworks/utils';
import React, { useCallback, useContext, useEffect, useState } from 'react';
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
  Candidate,
  CandidateId,
  Election,
} from '@votingworks/types';
import {
  Button,
  isElectionManagerAuth,
  Modal,
  Prose,
  Table,
  TD,
  Text,
} from '@votingworks/ui';

import { LogEventId } from '@votingworks/logging';
import { ManualDataPrecinctScreenProps } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';
import { LinkButton } from '../components/link_button';

import { NavigationScreen } from '../components/navigation_screen';
import { getContestsForPrecinct } from '../utils/election';
import { TextInput } from '../components/text_input';
import {
  convertTalliesByPrecinctToFullExternalTally,
  getEmptyExternalTalliesByPrecinct,
  getTotalNumberOfBallots,
} from '../utils/external_tallies';
import { useWriteInSummaryQuery } from '../hooks/use_write_in_summary_query';
import {
  getAdjudicatedWriteInCandidate,
  isManuallyAdjudicatedWriteInCandidate,
} from '../utils/write_ins';

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
            primary
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

// Re-calculates the total number of ballots in each contest to create an
// external tally from contest tallies
export function getExternalTallyFromContestTallies(
  contestTallies: Dictionary<TempContestTally>,
  election: Election
): TempExternalTally {
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
    fullElectionExternalTallies,
    updateExternalTally,
    manualTallyVotingMethod,
    auth,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const userRole = auth.user.role;
  const { election } = electionDefinition;
  // TODO export the type for this somewhere
  const { precinctId: currentPrecinctId } =
    useParams<ManualDataPrecinctScreenProps>();
  const history = useHistory();

  const existingManualData = fullElectionExternalTallies.get(
    ExternalTallySourceType.Manual
  );
  const ballotType =
    existingManualData?.votingMethod ?? manualTallyVotingMethod;
  const existingTalliesByPrecinct: Dictionary<TempExternalTally> | undefined =
    existingManualData?.resultsByCategory.get(TallyCategory.Precinct);

  const currentPrecinct = election.precincts.find(
    (p) => p.id === currentPrecinctId
  );
  const existingPrecinctTally = existingTalliesByPrecinct
    ? existingTalliesByPrecinct[currentPrecinctId]
    : undefined;

  const [talliesByPrecinct, setTalliesByPrecinct] = useState(
    existingTalliesByPrecinct
  );
  const [currentPrecinctTally, setCurrentPrecinctTally] = useState(
    existingPrecinctTally
  );

  const writeInSummaryQuery = useWriteInSummaryQuery({ status: 'adjudicated' });
  // Get empty tallies with previously adjudicated candidate names, only
  // when none already exist at initial page load
  useEffect(() => {
    if (talliesByPrecinct) return;
    if (!writeInSummaryQuery.data) return;
    if (!writeInSummaryQuery.isFetchedAfterMount) return;

    const summaries = writeInSummaryQuery.data;
    const adjudications = summaries
      .filter((summary) => summary.writeInCount > 0)
      .map((summary) => summary.writeInAdjudication);

    const adjudicatedValuesByContestId: Map<ContestId, string[]> = new Map();
    for (const adjudication of adjudications) {
      // Omit adjudications for official candidates
      if (!adjudication.adjudicatedOptionId) {
        const currentValuesForContest =
          adjudicatedValuesByContestId.get(adjudication.contestId) ?? [];
        currentValuesForContest.push(adjudication.adjudicatedValue);
        adjudicatedValuesByContestId.set(
          adjudication.contestId,
          currentValuesForContest
        );
      }
    }

    const emptyExternalTalliesByPrecinct = getEmptyExternalTalliesByPrecinct(
      election,
      adjudicatedValuesByContestId
    );
    setTalliesByPrecinct(emptyExternalTalliesByPrecinct);
    setCurrentPrecinctTally(emptyExternalTalliesByPrecinct[currentPrecinctId]);
  }, [writeInSummaryQuery, talliesByPrecinct, currentPrecinctId, election]);

  // Turn the precinct tallies into a CSV SEMS file and save that file as the
  // external results file with a name implying manual data entry happened
  async function handleImportingData() {
    // Convert the temporary data structure that allows empty strings or
    // numbers for all tallies to fill in 0s for any empty strings.
    assert(talliesByPrecinct);
    assert(currentPrecinctTally);
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
    await logger.log(LogEventId.ManualTallyDataEdited, userRole, {
      disposition: 'success',
      message: `Manually entered tally data added or edited for precinct: ${currentPrecinctId}`,
      numberOfBallotsInPrecinct: currentPrecinctTally.numberOfBallotsCounted,
      precinctId: currentPrecinctId,
    });
    await updateExternalTally(externalTally);
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
      getExternalTallyFromContestTallies(
        {
          ...currentPrecinctTally.contestTallies,
          [contestId]: newContestTally,
        },
        election
      )
    );
  }

  // Modifies the external tally in place and returns the same object
  function addWriteInCandidateToExternalTally(
    externalTally: TempExternalTally,
    contestId: string,
    name: string
  ) {
    const contestTally = externalTally.contestTallies[contestId];
    assert(contestTally);

    const candidate = getAdjudicatedWriteInCandidate(name, true);
    contestTally.tallies[candidate.id] = {
      option: candidate,
      tally: 0,
    };

    return externalTally;
  }

  // modifies the external tally in place and returns the same object
  const removeCandidateFromTempExternalTally = useCallback(
    (
      externalTally: TempExternalTally,
      contestId: ContestId,
      removedCandidateId: CandidateId
    ) => {
      const contestTally = externalTally.contestTallies[contestId];
      assert(contestTally);

      const newContestOptionTallies: Dictionary<TempContestOptionTally> = {};
      for (const [candidateId, candidateOptionTally] of Object.entries(
        contestTally.tallies
      )) {
        if (candidateId !== removedCandidateId) {
          newContestOptionTallies[candidateId] = candidateOptionTally;
        }
      }

      const newContestTally = getContestTallyWithUpdatedNumberOfBallots({
        ...contestTally,
        tallies: newContestOptionTallies,
      });

      return getExternalTallyFromContestTallies(
        {
          ...externalTally.contestTallies,
          [contestId]: newContestTally,
        },
        election
      );
    },
    [election]
  );

  const addWriteInCandidate = useCallback(
    (contestId: string, name: string) => {
      assert(currentPrecinctTally);
      assert(talliesByPrecinct);

      setCurrentPrecinctTally({
        ...addWriteInCandidateToExternalTally(
          currentPrecinctTally,
          contestId,
          name
        ),
      });

      const newTalliesByPrecinct: Dictionary<TempExternalTally> = {};

      for (const [precinctId, precinctTally] of Object.entries(
        talliesByPrecinct
      )) {
        assert(precinctTally);
        newTalliesByPrecinct[precinctId] = addWriteInCandidateToExternalTally(
          precinctTally,
          contestId,
          name
        );
      }

      setTalliesByPrecinct(newTalliesByPrecinct);
    },
    [currentPrecinctTally, talliesByPrecinct]
  );

  const removeCandidate = useCallback(
    (contestId: string, candidateId: string) => {
      assert(currentPrecinctTally);
      assert(talliesByPrecinct);

      setCurrentPrecinctTally({
        ...removeCandidateFromTempExternalTally(
          currentPrecinctTally,
          contestId,
          candidateId
        ),
      });

      const newTalliesByPrecinct: Dictionary<TempExternalTally> = {};

      for (const [precinctId, precinctTally] of Object.entries(
        talliesByPrecinct
      )) {
        assert(precinctTally);
        newTalliesByPrecinct[precinctId] = removeCandidateFromTempExternalTally(
          precinctTally,
          contestId,
          candidateId
        );
      }

      setTalliesByPrecinct(newTalliesByPrecinct);
    },
    [
      currentPrecinctTally,
      removeCandidateFromTempExternalTally,
      talliesByPrecinct,
    ]
  );

  const [candidateToRemove, setCandidateToRemove] = useState<{
    candidate: Candidate;
    contest: Contest;
  }>();

  const onConfirmRemoveCandidate = useCallback(() => {
    assert(candidateToRemove);
    removeCandidate(
      candidateToRemove.contest.id,
      candidateToRemove.candidate.id
    );
    setCandidateToRemove(undefined);
  }, [candidateToRemove, removeCandidate]);

  const onCancelRemoveCandidate = useCallback(() => {
    setCandidateToRemove(undefined);
  }, []);

  const currentContests = expandEitherNeitherContests(
    getContestsForPrecinct(election, currentPrecinctId)
  );

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
          if (contest.partyId) {
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
              <Text small>{contest.section}</Text>
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
          <Button primary onPress={handleImportingData}>
            Save {votingMethodName} Results for {currentPrecinct.name}
          </Button>
        </p>
      </Prose>
      {candidateToRemove && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <p>
                Do you want to remove the following write-in candidate from the
                manually entered results for the contest for{' '}
                {candidateToRemove.contest.title}?
              </p>
              <p>
                <strong>{candidateToRemove.candidate.name}</strong>
              </p>
              <p>
                The candidate will be removed from the manual results for{' '}
                <em>all precincts</em> once changes are saved.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button danger onPress={onConfirmRemoveCandidate}>
                Remove Candidate
              </Button>
              <Button onPress={onCancelRemoveCandidate}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={onCancelRemoveCandidate}
        />
      )}
    </NavigationScreen>
  );
}
