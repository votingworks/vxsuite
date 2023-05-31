import { assert, assertDefined, find } from '@votingworks/basics';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  AnyContest,
  Dictionary,
  ContestVoteOption,
  ContestOptionTally,
  ContestTally,
  ManualTally,
  ContestId,
  getContestDistrictName,
  getContests,
} from '@votingworks/types';
import {
  Button,
  Table,
  TD,
  LinkButton,
  Icons,
  P,
  H3,
  Font,
} from '@votingworks/ui';
import { isElectionManagerAuth, getEmptyManualTally } from '@votingworks/utils';

import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';
import { ManualDataEntryScreenProps } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { TextInput } from '../components/text_input';
import {
  getManualResults,
  getWriteInCandidates,
  setManualResults,
} from '../api';
import { normalizeWriteInName } from '../utils/write_ins';
import { Loading } from '../components/loading';

const TallyInput = styled(TextInput)`
  width: 4em;
  text-align: center;
`;

export const ContestData = styled.div`
  margin: 2rem 0 3rem;
  width: 50%;
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
  tfoot td {
    border-bottom: unset;
    padding-top: 0.5em;
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

  if (isAddingWriteIn) {
    return (
      <tr>
        <TD narrow textAlign="center">
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
        </TD>
        <TD>
          <TextInput
            defaultValue=""
            data-testid={`${contestId}-write-in-input`}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setWriteInName(e.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onAdd();
              }
            }}
          />
        </TD>
        <TD textAlign="right">
          <Button small onPress={() => setIsAddingWriteIn(false)}>
            Cancel
          </Button>
        </TD>
      </tr>
    );
  }

  return (
    <tr>
      <TD colSpan={3}>
        <Button small onPress={() => setIsAddingWriteIn(true)}>
          Add Write-In Candidate
        </Button>
      </TD>
    </tr>
  );
}

// While we're holding data internally in this component tallies can be stored
// as strings or as numbers to allow the user to delete a "0" in the text boxes.
// When the data is saved empty strings are converted back to 0s.
type EmptyValue = '';
type InputValue = EmptyValue | number;

interface TempContestOptionTally {
  readonly option: ContestVoteOption;
  readonly tally: InputValue;
}

interface TempContestTallyMeta {
  readonly ballots: InputValue;
  readonly undervotes: InputValue;
  readonly overvotes: InputValue;
}

interface TempContestTally {
  readonly contest: AnyContest;
  readonly tallies: Dictionary<TempContestOptionTally>;
  readonly metadata: TempContestTallyMeta;
  readonly enteredVotesMinusExpectedVotes?: number;
}

interface TempManualTally {
  readonly contestTallies: Dictionary<TempContestTally>;
}

interface TempWriteInCandidate {
  readonly id: string;
  readonly name: string;
  readonly contestId: string;
}

function getNumericalValueForTally(tally: InputValue): number {
  if (tally === '') {
    return 0;
  }
  return tally;
}

// Convert temporary contest tally that allows for empty strings to the regular
// type by mapping any empty string values to zeros.
function convertContestTally(tempContestTally: TempContestTally): ContestTally {
  const convertedOptionTallies: Dictionary<ContestOptionTally> = {};
  for (const optionId of Object.keys(tempContestTally.tallies)) {
    const optionTally = tempContestTally.tallies[optionId];
    assert(optionTally);
    convertedOptionTallies[optionId] = {
      ...optionTally,
      tally: getNumericalValueForTally(optionTally.tally),
    };
  }
  return {
    ...tempContestTally,
    tallies: convertedOptionTallies,
    metadata: {
      ballots: getNumericalValueForTally(tempContestTally.metadata.ballots),
      undervotes: getNumericalValueForTally(
        tempContestTally.metadata.undervotes
      ),
      overvotes: getNumericalValueForTally(tempContestTally.metadata.overvotes),
    },
  };
}

function convertContestTallies(
  tempContestTallies: Dictionary<TempContestTally>
): Dictionary<ContestTally> {
  const convertedContestTallies: Dictionary<ContestTally> = {};
  for (const contestId of Object.keys(tempContestTallies)) {
    const tempContestTally = tempContestTallies[contestId];
    assert(tempContestTally);
    convertedContestTallies[contestId] = convertContestTally(tempContestTally);
  }
  return convertedContestTallies;
}

// We treat the maximum of all the contests' ballot counts as the total
function getTotalNumberOfBallots(
  contestTallies: Dictionary<ContestTally>
): number {
  return Math.max(
    ...Object.values(contestTallies).map(
      (contestTally) => assertDefined(contestTally).metadata.ballots
    )
  );
}

type ContestValidationState = 'no-results' | 'invalid' | 'valid';

function getContestValidationState(
  tempContestTally: TempContestTally
): ContestValidationState {
  const contestTally = convertContestTally(tempContestTally);
  const ballotMultiplier = // number of votes expected per ballot
    contestTally.contest.type === 'yesno' ? 1 : contestTally.contest.seats;

  const expectedVotes = contestTally.metadata.ballots * ballotMultiplier;

  const enteredVotes =
    contestTally.metadata.overvotes +
    contestTally.metadata.undervotes +
    Object.values(contestTally.tallies).reduce(
      (acc, cur) => acc + assertDefined(cur).tally,
      0
    );

  if (expectedVotes === 0 && enteredVotes === 0) return 'no-results';

  return enteredVotes === expectedVotes ? 'valid' : 'invalid';
}

export function ManualDataEntryScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const { election } = electionDefinition;
  const {
    precinctId,
    ballotStyleId,
    ballotType: ballotTypeParam,
  } = useParams<ManualDataEntryScreenProps>();
  const precinct = find(election.precincts, (p) => p.id === precinctId);
  const ballotStyle = find(
    election.ballotStyles,
    (bs) => bs.id === ballotStyleId
  );
  assert(ballotTypeParam === 'precinct' || ballotTypeParam === 'absentee');
  const ballotType = ballotTypeParam as ManualResultsVotingMethod;
  const ballotTypeTitle = ballotType === 'absentee' ? 'Absentee' : 'Precinct';
  const history = useHistory();

  const getWriteInCandidatesQuery = getWriteInCandidates.useQuery();
  const setManualTallyMutation = setManualResults.useMutation();
  const getManualTallyQuery = getManualResults.useQuery({
    precinctId,
    ballotStyleId,
    ballotType,
  });

  const [tempManualTally, setTempManualTally] = useState<TempManualTally>(
    getEmptyManualTally(election, ballotStyle)
  );
  useEffect(() => {
    if (getManualTallyQuery.data) {
      setTempManualTally(getManualTallyQuery.data.manualResults);
    }
  }, [getManualTallyQuery.data]);

  const [tempWriteInCandidates, setTempWriteInCandidates] = useState<
    TempWriteInCandidate[]
  >([]);

  function saveResults() {
    assert(tempManualTally);
    // replace temporary tally values with the numeric values we'll save
    const convertedContestTallies = convertContestTallies(
      tempManualTally.contestTallies
    );
    const convertedManualTally: ManualTally = {
      numberOfBallotsCounted: getTotalNumberOfBallots(convertedContestTallies),
      contestTallies: convertedContestTallies,
    };

    setManualTallyMutation.mutate({
      precinctId,
      ballotStyleId,
      ballotType,
      manualTally: convertedManualTally,
    });

    history.push(routerPaths.manualDataSummary);
  }

  function updateManualTallyWithNewContestTally(
    newContestTally: TempContestTally
  ) {
    setTempManualTally({
      contestTallies: {
        ...tempManualTally.contestTallies,
        [newContestTally.contest.id]: newContestTally,
      },
    });
  }

  function getValueForInput(
    contestId: ContestId,
    dataKey: string
  ): number | EmptyValue {
    assert(tempManualTally);
    const contestTally = tempManualTally.contestTallies[contestId];
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
    event: React.FormEvent<HTMLInputElement>,
    candidateName?: string
  ) {
    assert(tempManualTally);
    const contestTally = tempManualTally.contestTallies[contestId];
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
      case 'numBallots':
        newContestTally = {
          ...contestTally,
          metadata: {
            ...contestTally.metadata,
            ballots: valueToSave,
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

    updateManualTallyWithNewContestTally(newContestTally);
  }

  function addTempWriteInCandidate(name: string, contestId: string): void {
    setTempWriteInCandidates([
      ...tempWriteInCandidates,
      {
        id: `temp-write-in-(${name})`,
        name,
        contestId,
      },
    ]);
  }

  function removeTempWriteInCandidate(id: string, contestId: string): void {
    setTempWriteInCandidates(tempWriteInCandidates.filter((c) => c.id !== id));

    // remove temp candidate from contest
    assert(tempManualTally);
    const contestTally = tempManualTally.contestTallies[contestId];
    assert(contestTally);
    delete contestTally?.tallies[id];

    updateManualTallyWithNewContestTally(contestTally);
  }

  const currentContests = getContests({ election, ballotStyle });

  if (!getWriteInCandidatesQuery.isSuccess || !getManualTallyQuery.isSuccess) {
    return (
      <NavigationScreen title="Manually Entered Results Form">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const writeInCandidates = getWriteInCandidatesQuery.data;

  const contestValidationStates: Record<ContestId, ContestValidationState> = {};
  for (const contest of currentContests) {
    contestValidationStates[contest.id] = getContestValidationState(
      assertDefined(tempManualTally.contestTallies[contest.id])
    );
  }
  const someContestHasInvalidResults = Object.values(
    contestValidationStates
  ).some((s) => s === 'invalid');
  const someContestHasNoResults = Object.values(contestValidationStates).some(
    (s) => s === 'no-results'
  );

  return (
    <NavigationScreen title="Manually Entered Results Form">
      <P>
        <Font weight="bold">Ballot Style:</Font> {ballotStyleId} |{' '}
        <Font weight="bold">Precinct:</Font> {precinct.name} |{' '}
        <Font weight="bold">Voting Method:</Font> {ballotTypeTitle}
      </P>
      <P>Enter the number of votes for each contest option.</P>
      {currentContests.map((contest) => {
        const contestTally = tempManualTally.contestTallies[contest.id];
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

        const contestValidationState = contestValidationStates[contest.id];

        return (
          <ContestData key={contest.id}>
            <P>{getContestDistrictName(election, contest)}</P>
            <div>
              <H3>{contest.title}</H3>
            </div>
            <Table condensed>
              <tbody>
                <ContestDataRow
                  label={<P weight="bold">Total Ballots Cast</P>}
                  testId={`${contest.id}-numBallots`}
                >
                  <TallyInput
                    name={`${contest.id}-numBallots`}
                    data-testid={`${contest.id}-numBallots-input`}
                    value={getValueForInput(contest.id, 'numBallots')}
                    onChange={(e) =>
                      updateContestData(contest.id, 'numBallots', e)
                    }
                  />
                </ContestDataRow>
                <ContestDataRow
                  label={<P>undervotes</P>}
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
                  label={<P>overvotes</P>}
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
                          removeTempWriteInCandidate(candidate.id, contest.id);
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
                        onChange={(e) => updateContestData(contest.id, 'no', e)}
                      />
                    </ContestDataRow>
                  </React.Fragment>
                )}
              </tbody>
              <tfoot>
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
                <tr>
                  <TD textAlign="center">
                    {contestValidationState === 'no-results' ? (
                      <Icons.Info />
                    ) : contestValidationState === 'invalid' ? (
                      <Font color="warning">
                        <Icons.Warning />
                      </Font>
                    ) : (
                      <Font color="success">
                        <Icons.Checkbox />
                      </Font>
                    )}
                  </TD>
                  <TD>
                    {' '}
                    <P>
                      {contestValidationState === 'no-results'
                        ? 'No results entered'
                        : contestValidationState === 'invalid'
                        ? 'Entered results do not match total ballots cast'
                        : 'Entered results are valid'}
                    </P>
                  </TD>
                </tr>
              </tfoot>
            </Table>
          </ContestData>
        );
      })}
      <P weight="semiBold">
        {someContestHasInvalidResults
          ? 'At least one contest above has invalid results entered'
          : someContestHasNoResults
          ? 'At least one contest above has no results entered'
          : 'All entered contest results are valid'}
      </P>
      <P>
        <LinkButton to={routerPaths.manualDataSummary}>Cancel</LinkButton>{' '}
        <Button
          variant={
            someContestHasInvalidResults || someContestHasNoResults
              ? 'warning'
              : 'primary'
          }
          onPress={saveResults}
        >
          Save Results
        </Button>{' '}
      </P>
    </NavigationScreen>
  );
}
