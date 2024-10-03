import {
  assert,
  assertDefined,
  find,
  iter,
  mapObject,
} from '@votingworks/basics';
import React, { useCallback, useContext, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  ContestId,
  getContestDistrictName,
  getContests,
  Tabulation,
  CandidateId,
  Admin as AdminTypes,
} from '@votingworks/types';
import {
  Button,
  LinkButton,
  Icons,
  P,
  H3,
  Card,
  Caption,
  LabelledText,
  H1,
  Font,
  TaskContent,
  TaskControls,
  TaskHeader,
  TaskScreen,
} from '@votingworks/ui';
import {
  isElectionManagerAuth,
  getEmptyManualElectionResults,
  getParentBallotStyles,
} from '@votingworks/utils';

import type {
  ManualResultsRecord,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';

import {
  getManualResults,
  getWriteInCandidates,
  setManualResults,
} from '../api';
import { normalizeWriteInName } from '../utils/write_ins';
import { ManualDataEntryScreenProps } from '../config/types';

export const TITLE = 'Edit Tallies';

const ControlsContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  justify-content: space-between;
  padding: 1rem;
  flex: 1;
`;

const TallyMetadata = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormStatus = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ContestsContainer = styled.div`
  background: ${(p) => p.theme.colors.containerHigh};
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
`;

const ContestData = styled(Card)`
  background: ${(p) => p.theme.colors.background};

  h3 {
    margin-top: 0 !important;
    margin-bottom: 0.25rem;
  }
`;

const TallyInput = styled.input`
  width: 4em;
  text-align: center;
`;

const ContestDataRow = styled.div`
  border-top: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;

  &:last-child {
    border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
  }
`;

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
  const disabled =
    writeInName.length === 0 ||
    disallowedCandidateNames.includes(normalizeWriteInName(writeInName));

  if (isAddingWriteIn) {
    return (
      <ContestDataRow>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          defaultValue=""
          data-testid={`${contestId}-write-in-input`}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setWriteInName(e.target.value)
          }
          onKeyDown={(event) => {
            if (!disabled && event.key === 'Enter') {
              onAdd();
            }
          }}
          style={{ flexGrow: 1 }}
        />
        <Button
          icon="Add"
          variant="primary"
          onPress={onAdd}
          disabled={disabled}
        >
          Add
        </Button>
        <Button onPress={() => setIsAddingWriteIn(false)}>Cancel</Button>
      </ContestDataRow>
    );
  }

  return (
    <ContestDataRow>
      <Button icon="Add" onPress={() => setIsAddingWriteIn(true)}>
        Add Write-In Candidate
      </Button>
    </ContestDataRow>
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
      : iter(Object.values(contestResults.tallies))
          .map(({ tally }) => tally)
          .sum());

  if (expectedVotes === 0 && enteredVotes === 0) return 'no-results';

  return enteredVotes === expectedVotes ? 'valid' : 'invalid';
}

function ManualResultsDataEntryScreenForm({
  savedWriteInCandidates,
  savedManualResults,
}: {
  savedWriteInCandidates: WriteInCandidateRecord[];
  savedManualResults: ManualResultsRecord | null;
}): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const { election } = electionDefinition;
  const { precinctId, ballotStyleGroupId, votingMethod } =
    useParams<ManualDataEntryScreenProps>();
  const precinct = find(election.precincts, (p) => p.id === precinctId);
  console.log(ballotStyleGroupId);
  const ballotStyle = find(
    getParentBallotStyles(election.ballotStyles),
    (bs) => bs.id === ballotStyleGroupId
  );
  const votingMethodTitle =
    votingMethod === 'absentee' ? 'Absentee' : 'Precinct';
  const history = useHistory();

  const setManualTallyMutation = setManualResults.useMutation();

  const initialManualResults =
    savedManualResults?.manualResults ||
    getEmptyManualElectionResults(election);
  const [tempManualResults, setTempManualResults] =
    useState<TempManualResults>(initialManualResults);

  const [tempWriteInCandidates, setTempWriteInCandidates] = useState<
    TempWriteInCandidate[]
  >([]);

  function saveResults() {
    setManualTallyMutation.mutate(
      {
        precinctId,
        ballotStyleGroupId,
        votingMethod,
        // replace temporary tally values with the numeric values we'll save
        manualResults: convertManualResults(tempManualResults),
      },
      {
        onSuccess: () => {
          history.push(routerPaths.manualDataSummary);
        },
      }
    );
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
        id: `${AdminTypes.TEMPORARY_WRITE_IN_ID_PREFIX}(${name})`,
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
    <TaskScreen>
      <TaskControls style={{ width: '20rem' }}>
        <TaskHeader>
          <H1>{TITLE}</H1>
          <LinkButton
            icon="X"
            color="inverseNeutral"
            fill="transparent"
            to={routerPaths.manualDataSummary}
          >
            Close
          </LinkButton>
        </TaskHeader>
        <ControlsContent>
          <TallyMetadata>
            <LabelledText label="Ballot Style">
              {ballotStyleGroupId}
            </LabelledText>
            <LabelledText label="Precinct">{precinct.name}</LabelledText>
            <LabelledText label="Voting Method">
              {votingMethodTitle}
            </LabelledText>
          </TallyMetadata>
          <div>
            <FormStatus>
              <div style={{ marginBottom: '0.125rem' }}>
                {someContestHasInvalidResults || someContestHasNoResults ? (
                  <Icons.Warning color="warning" />
                ) : (
                  <Icons.Checkbox color="success" />
                )}
              </div>
              {someContestHasInvalidResults
                ? 'At least one contest has invalid tallies entered'
                : someContestHasNoResults
                ? 'At least one contest has no tallies entered'
                : 'All entered contest tallies are valid'}
            </FormStatus>
            <Actions>
              <LinkButton
                style={{ flex: 1 }}
                to={routerPaths.manualDataSummary}
              >
                Cancel
              </LinkButton>
              <Button
                variant="primary"
                icon="Done"
                onPress={saveResults}
                disabled={setManualTallyMutation.isLoading}
              >
                Save Tallies
              </Button>
            </Actions>
          </div>
        </ControlsContent>
      </TaskControls>
      <TaskContent>
        <ContestsContainer>
          {currentContests.map((contest, i) => {
            const contestWriteInCandidates = savedWriteInCandidates.filter(
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
                <Caption>{getContestDistrictName(election, contest)}</Caption>
                <H3>{contest.title}</H3>
                <P>
                  {contestValidationState === 'no-results' ? (
                    <Icons.Info />
                  ) : contestValidationState === 'invalid' ? (
                    <Icons.Warning color="warning" />
                  ) : (
                    <Icons.Checkbox color="success" />
                  )}{' '}
                  {contestValidationState === 'no-results'
                    ? 'No tallies entered'
                    : contestValidationState === 'invalid'
                    ? 'Entered tallies do not match total ballots cast'
                    : 'Entered tallies are valid'}
                </P>
                <ContestDataRow data-testid={`${contest.id}-numBallots`}>
                  <TallyInput
                    autoFocus={i === 0}
                    id={`${contest.id}-numBallots`}
                    data-testid={`${contest.id}-numBallots-input`}
                    value={getValueForInput(contest.id, 'numBallots')}
                    onChange={(e) =>
                      updateContestData(contest.id, 'numBallots', e)
                    }
                  />
                  <label htmlFor={`${contest.id}-numBallots`}>
                    <Font weight="bold">Total Ballots Cast</Font>
                  </label>
                </ContestDataRow>
                <ContestDataRow data-testid={`${contest.id}-undervotes`}>
                  <TallyInput
                    id={`${contest.id}-undervotes`}
                    data-testid={`${contest.id}-undervotes-input`}
                    value={getValueForInput(contest.id, 'undervotes')}
                    onChange={(e) =>
                      updateContestData(contest.id, 'undervotes', e)
                    }
                  />
                  <label htmlFor={`${contest.id}-undervotes`}>undervotes</label>
                </ContestDataRow>
                <ContestDataRow data-testid={`${contest.id}-overvotes`}>
                  <TallyInput
                    id={`${contest.id}-overvotes`}
                    data-testid={`${contest.id}-overvotes-input`}
                    value={getValueForInput(contest.id, 'overvotes')}
                    onChange={(e) =>
                      updateContestData(contest.id, 'overvotes', e)
                    }
                  />
                  <label htmlFor={`${contest.id}-overvotes`}>overvotes</label>
                </ContestDataRow>
                {contest.type === 'candidate' && (
                  <React.Fragment>
                    {contest.candidates
                      .filter((c) => !c.isWriteIn)
                      .map((candidate) => (
                        <ContestDataRow
                          key={candidate.id}
                          data-testid={`${contest.id}-${candidate.id}`}
                        >
                          <TallyInput
                            id={`${contest.id}-${candidate.id}`}
                            data-testid={`${contest.id}-${candidate.id}-input`}
                            value={getValueForInput(contest.id, candidate.id)}
                            onChange={(e) =>
                              updateContestData(contest.id, candidate.id, e)
                            }
                          />
                          <label htmlFor={`${contest.id}-${candidate.id}`}>
                            {candidate.name}
                          </label>
                        </ContestDataRow>
                      ))}
                    {contestWriteInCandidates.map((candidate) => (
                      <ContestDataRow
                        key={candidate.id}
                        data-testid={`${contest.id}-${candidate.id}`}
                      >
                        <TallyInput
                          id={`${contest.id}-${candidate.id}`}
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
                        <label htmlFor={`${contest.id}-${candidate.id}`}>
                          {candidate.name} (write-in)
                        </label>
                      </ContestDataRow>
                    ))}
                    {contestTempWriteInCandidates.map((candidate) => (
                      <ContestDataRow
                        key={candidate.id}
                        data-testid={`${contest.id}-${candidate.id}`}
                      >
                        <TallyInput
                          autoFocus
                          id={`${contest.id}-${candidate.id}`}
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
                        <label htmlFor={`${contest.id}-${candidate.id}`}>
                          {candidate.name} (write-in)
                        </label>
                        <Button
                          icon="X"
                          variant="danger"
                          fill="transparent"
                          onPress={() => {
                            removeTempWriteInCandidate(
                              candidate.id,
                              contest.id
                            );
                          }}
                          style={{ marginLeft: 'auto' }}
                        >
                          Remove
                        </Button>
                      </ContestDataRow>
                    ))}
                  </React.Fragment>
                )}
                {contest.type === 'yesno' && (
                  <React.Fragment>
                    <ContestDataRow
                      data-testid={`${contest.id}-${contest.yesOption.id}`}
                    >
                      <TallyInput
                        name={`${contest.id}-yes`}
                        data-testid={`${contest.id}-${contest.yesOption.id}-input`}
                        value={getValueForInput(contest.id, 'yesTally')}
                        onChange={(e) =>
                          updateContestData(contest.id, 'yesTally', e)
                        }
                      />
                      <label htmlFor={`${contest.id}-yes`}>
                        {contest.yesOption.label}
                      </label>
                    </ContestDataRow>
                    <ContestDataRow
                      data-testid={`${contest.id}-${contest.noOption.id}`}
                    >
                      <TallyInput
                        id={`${contest.id}-no`}
                        data-testid={`${contest.id}-${contest.noOption.id}-input`}
                        value={getValueForInput(contest.id, 'noTally')}
                        onChange={(e) =>
                          updateContestData(contest.id, 'noTally', e)
                        }
                      />
                      <label htmlFor={`${contest.id}-no`}>
                        {contest.noOption.label}
                      </label>
                    </ContestDataRow>
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
              </ContestData>
            );
          })}
        </ContestsContainer>
      </TaskContent>
    </TaskScreen>
  );
}

export function ManualDataEntryScreen(): JSX.Element | null {
  const { precinctId, ballotStyleGroupId, votingMethod } =
    useParams<ManualDataEntryScreenProps>();
  console.log('hi ', ballotStyleGroupId);
  const getWriteInCandidatesQuery = getWriteInCandidates.useQuery();
  const getManualResultsQuery = getManualResults.useQuery({
    precinctId,
    ballotStyleGroupId,
    votingMethod,
  });

  if (
    !getWriteInCandidatesQuery.isSuccess ||
    !getManualResultsQuery.isSuccess
  ) {
    return null;
  }

  return (
    <ManualResultsDataEntryScreenForm
      savedWriteInCandidates={getWriteInCandidatesQuery.data}
      savedManualResults={getManualResultsQuery.data}
    />
  );
}
