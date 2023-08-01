import { assert, assertDefined, find, mapObject } from '@votingworks/basics';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  ContestId,
  getContestDistrictName,
  getContests,
  Tabulation,
  CandidateId,
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
import {
  isElectionManagerAuth,
  getEmptyManualElectionResults,
} from '@votingworks/utils';

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

  p:first-child {
    margin-bottom: 0;
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

// While we're holding data internally in this component, tallies can be stored
// as strings or as numbers to allow the user to delete a "0" in the text boxes.
// When the data is saved empty strings are converted back to 0s.
type EmptyValue = '';
type InputValue = EmptyValue | number;

type TempCandidateTally = Omit<Tabulation.CandidateTally, 'tally'> & {
  tally: InputValue;
};

interface TempContestResultsMetadata {
  ballots: InputValue;
  overvotes: InputValue;
  undervotes: InputValue;
}

type TempYesNoContestResults = Omit<
  Tabulation.YesNoContestResults,
  'ballots' | 'overvotes' | 'undervotes' | 'yesTally' | 'noTally'
> &
  TempContestResultsMetadata & {
    yesTally: InputValue;
    noTally: InputValue;
  };

type TempCandidateContestResults = Omit<
  Tabulation.CandidateContestResults,
  'ballots' | 'overvotes' | 'undervotes' | 'tallies'
> &
  TempContestResultsMetadata & {
    tallies: Record<CandidateId, TempCandidateTally>;
  };

type TempContestResults = TempYesNoContestResults | TempCandidateContestResults;

interface TempManualResults {
  readonly contestResults: Record<ContestId, TempContestResults>;
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

// Convert temporary contest results that allows for empty strings to the regular
// type by mapping any empty string values to zeros.
function convertContestResults(
  tempContestResults: TempContestResults
): Tabulation.ContestResults {
  const metadata = {
    ballots: getNumericalValueForTally(tempContestResults.ballots),
    overvotes: getNumericalValueForTally(tempContestResults.overvotes),
    undervotes: getNumericalValueForTally(tempContestResults.undervotes),
  } as const;
  if (tempContestResults.contestType === 'yesno') {
    return {
      ...tempContestResults,
      ...metadata,
      yesTally: getNumericalValueForTally(tempContestResults.yesTally),
      noTally: getNumericalValueForTally(tempContestResults.noTally),
    };
  }

  return {
    ...tempContestResults,
    ...metadata,
    tallies: mapObject(tempContestResults.tallies, (tempCandidateTally) => ({
      ...tempCandidateTally,
      tally: getNumericalValueForTally(tempCandidateTally.tally),
    })),
  };
}

function convertManualResults(
  tempManualResults: TempManualResults
): Tabulation.ManualElectionResults {
  const convertedContestResults: Tabulation.ManualElectionResults['contestResults'] =
    {};
  for (const [contestId, tempContestResults] of Object.entries(
    tempManualResults.contestResults
  )) {
    convertedContestResults[contestId] =
      convertContestResults(tempContestResults);
  }
  return {
    contestResults: convertedContestResults,
    ballotCount: Math.max(
      ...Object.values(convertedContestResults).map(
        (contestResults) => contestResults.ballots
      )
    ),
  };
}

type ContestValidationState = 'no-results' | 'invalid' | 'valid';

function getContestValidationState(
  tempContestResults: TempContestResults
): ContestValidationState {
  const contestResults = convertContestResults(tempContestResults);
  const ballotMultiplier = // number of votes expected per ballot
    contestResults.contestType === 'yesno' ? 1 : contestResults.votesAllowed;

  const expectedVotes = contestResults.ballots * ballotMultiplier;

  const enteredVotes =
    contestResults.overvotes +
    contestResults.undervotes +
    (contestResults.contestType === 'yesno'
      ? contestResults.yesTally + contestResults.noTally
      : Object.values(contestResults.tallies).reduce(
          (acc, cur) => acc + cur.tally,
          0
        ));

  if (expectedVotes === 0 && enteredVotes === 0) return 'no-results';

  return enteredVotes === expectedVotes ? 'valid' : 'invalid';
}

export function ManualDataEntryScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const { election } = electionDefinition;
  const { precinctId, ballotStyleId, votingMethod } =
    useParams<ManualDataEntryScreenProps>();
  const precinct = find(election.precincts, (p) => p.id === precinctId);
  const ballotStyle = find(
    election.ballotStyles,
    (bs) => bs.id === ballotStyleId
  );
  const votingMethodTitle =
    votingMethod === 'absentee' ? 'Absentee' : 'Precinct';
  const history = useHistory();

  const getWriteInCandidatesQuery = getWriteInCandidates.useQuery();
  const setManualTallyMutation = setManualResults.useMutation();
  const getManualResultsQuery = getManualResults.useQuery({
    precinctId,
    ballotStyleId,
    votingMethod,
  });

  const [tempManualResults, setTempManualResults] = useState<TempManualResults>(
    getEmptyManualElectionResults(election)
  );
  useEffect(() => {
    if (getManualResultsQuery.data) {
      setTempManualResults(getManualResultsQuery.data.manualResults);
    }
  }, [getManualResultsQuery.data]);

  const [tempWriteInCandidates, setTempWriteInCandidates] = useState<
    TempWriteInCandidate[]
  >([]);

  function saveResults() {
    setManualTallyMutation.mutate({
      precinctId,
      ballotStyleId,
      votingMethod,
      // replace temporary tally values with the numeric values we'll save
      manualResults: convertManualResults(tempManualResults),
    });

    history.push(routerPaths.manualDataSummary);
  }

  function updateManualResultsWithNewContestResults(
    newContestResults: TempContestResults
  ) {
    setTempManualResults({
      contestResults: {
        ...tempManualResults.contestResults,
        [newContestResults.contestId]: newContestResults,
      },
    });
  }

  function getValueForInput(
    contestId: ContestId,
    dataKey: string
  ): number | EmptyValue {
    const contestResults = tempManualResults.contestResults[contestId];
    switch (dataKey) {
      case 'numBallots':
        return contestResults.ballots;
      case 'overvotes':
        return contestResults.overvotes;
      case 'undervotes':
        return contestResults.undervotes;
      case 'yesTally':
      case 'noTally':
        assert(contestResults.contestType === 'yesno');
        return dataKey === 'yesTally'
          ? contestResults.yesTally
          : contestResults.noTally;
      default:
        assert(contestResults.contestType === 'candidate');
        return contestResults.tallies[dataKey]?.tally ?? 0;
    }
  }

  function updateContestData(
    contestId: ContestId,
    dataKey: string,
    event: React.FormEvent<HTMLInputElement>,
    candidateName?: string
  ) {
    const contestResults = tempManualResults.contestResults[contestId];
    const stringValue = event.currentTarget.value;
    // eslint-disable-next-line vx/gts-safe-number-parse
    const numericalValue = Number(stringValue);
    if (Number.isNaN(numericalValue)) {
      return;
    }
    const valueToSave = stringValue === '' ? '' : numericalValue;
    let newContestResults = contestResults;
    switch (dataKey) {
      case 'overvotes':
        newContestResults = {
          ...contestResults,
          overvotes: valueToSave,
        };
        break;
      case 'undervotes':
        newContestResults = {
          ...contestResults,
          undervotes: valueToSave,
        };
        break;
      case 'numBallots':
        newContestResults = {
          ...contestResults,
          ballots: valueToSave,
        };
        break;
      case 'noTally':
      case 'yesTally':
        assert(contestResults.contestType === 'yesno');
        assert(newContestResults.contestType === 'yesno');
        if (dataKey === 'yesTally') {
          newContestResults = {
            ...contestResults,
            yesTally: valueToSave,
          };
        } else {
          newContestResults = {
            ...contestResults,
            noTally: valueToSave,
          };
        }
        break;
      default: {
        assert(contestResults.contestType === 'candidate');
        assert(newContestResults.contestType === 'candidate');
        const candidateTally = contestResults.tallies[dataKey];
        const newCandidateTally: TempCandidateTally = candidateTally
          ? {
              ...candidateTally,
              tally: valueToSave,
            }
          : {
              id: dataKey,
              isWriteIn: true,
              name: assertDefined(candidateName),
              tally: valueToSave,
            };
        newContestResults = {
          ...contestResults,
          tallies: {
            ...contestResults.tallies,
            [dataKey]: newCandidateTally,
          },
        };
      }
    }

    updateManualResultsWithNewContestResults(newContestResults);
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
    const contestResults = tempManualResults.contestResults[contestId];
    assert(contestResults.contestType === 'candidate');
    delete contestResults?.tallies[id];

    updateManualResultsWithNewContestResults(contestResults);
  }

  const currentContests = getContests({ election, ballotStyle });

  if (
    !getWriteInCandidatesQuery.isSuccess ||
    !getManualResultsQuery.isSuccess
  ) {
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
      tempManualResults.contestResults[contest.id]
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
        <Font weight="bold">Voting Method:</Font> {votingMethodTitle}
      </P>
      <P>Enter the number of votes for each contest option.</P>
      {currentContests.map((contest) => {
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
                        value={getValueForInput(contest.id, 'yesTally')}
                        onChange={(e) =>
                          updateContestData(contest.id, 'yesTally', e)
                        }
                      />
                    </ContestDataRow>
                    <ContestDataRow label="No" testId={`${contest.id}-no`}>
                      <TallyInput
                        name={`${contest.id}-no`}
                        data-testid={`${contest.id}-no-input`}
                        value={getValueForInput(contest.id, 'noTally')}
                        onChange={(e) =>
                          updateContestData(contest.id, 'noTally', e)
                        }
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
