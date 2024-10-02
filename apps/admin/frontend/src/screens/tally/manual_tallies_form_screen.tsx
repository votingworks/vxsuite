import {
  assert,
  assertDefined,
  find,
  iter,
  throwIllegalValue,
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
  AnyContest,
  Election,
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
  getGroupedBallotStyles,
} from '@votingworks/utils';

import type {
  ManualResultsRecord,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import { routerPaths } from '../../router_paths';

import { AppContext } from '../../contexts/app_context';

import {
  getManualResults,
  getWriteInCandidates,
  setManualResults,
} from '../../api';
import { normalizeWriteInName } from '../../utils/write_ins';
import { ManualDataEntryScreenProps } from '../../config/types';

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

// Form values can be numbers or empty (represented by empty string).
type EmptyValue = '';
type InputValue = EmptyValue | number;

type FormCandidateTally = Omit<Tabulation.CandidateTally, 'tally'> & {
  tally: InputValue;
};

interface FormContestResultsMetadata {
  ballots: InputValue;
  overvotes: InputValue;
  undervotes: InputValue;
}

type FormYesNoContestResults = Omit<
  Tabulation.YesNoContestResults,
  'ballots' | 'overvotes' | 'undervotes' | 'yesTally' | 'noTally'
> &
  FormContestResultsMetadata & {
    yesTally: InputValue;
    noTally: InputValue;
  };

type FormCandidateContestResults = Omit<
  Tabulation.CandidateContestResults,
  'ballots' | 'overvotes' | 'undervotes' | 'tallies'
> &
  FormContestResultsMetadata & {
    tallies: Record<CandidateId, FormCandidateTally>;
  };

type FormContestResults = FormYesNoContestResults | FormCandidateContestResults;

interface FormManualResults {
  readonly contestResults: Record<ContestId, FormContestResults>;
}

interface FormWriteInCandidate {
  readonly id: string;
  readonly name: string;
  readonly contestId: string;
}

function emptyFormContestResults(contest: AnyContest): FormContestResults {
  switch (contest.type) {
    case 'yesno':
      return {
        contestId: contest.id,
        contestType: 'yesno',
        yesOptionId: contest.yesOption.id,
        noOptionId: contest.noOption.id,
        ballots: '',
        overvotes: '',
        undervotes: '',
        yesTally: '',
        noTally: '',
      };

    case 'candidate':
      return {
        contestId: contest.id,
        contestType: 'candidate',
        votesAllowed: contest.seats,
        ballots: '',
        overvotes: '',
        undervotes: '',
        tallies: Object.fromEntries(
          contest.candidates.map((candidate) => [
            candidate.id,
            {
              id: candidate.id,
              name: candidate.name,
              tally: '',
            },
          ])
        ),
      };

    default:
      throwIllegalValue(contest);
  }
}

type ContestValidationState = 'empty' | 'incomplete' | 'invalid' | 'valid';

function getContestValidationState(
  formContestResults: FormContestResults
): ContestValidationState {
  const formValues = [
    formContestResults.ballots,
    formContestResults.overvotes,
    formContestResults.undervotes,
    ...(formContestResults.contestType === 'candidate'
      ? Object.values(formContestResults.tallies).map(({ tally }) => tally)
      : [formContestResults.yesTally, formContestResults.noTally]),
  ];
  if (formValues.every((v) => v === '')) {
    return 'empty';
  }
  if (formValues.some((v) => v === '')) {
    return 'incomplete';
  }
  const contestResults = formContestResults as Tabulation.ContestResults;

  const ballotMultiplier = // number of votes expected per ballot
    formContestResults.contestType === 'yesno'
      ? 1
      : formContestResults.votesAllowed;

  const expectedVotes = contestResults.ballots * ballotMultiplier;

  const enteredVotes =
    contestResults.overvotes +
    contestResults.undervotes +
    (contestResults.contestType === 'yesno'
      ? contestResults.yesTally + contestResults.noTally
      : iter(Object.values(contestResults.tallies))
          .map(({ tally }) => tally)
          .sum());

  return enteredVotes === expectedVotes ? 'valid' : 'invalid';
}

function convertTabulationResultsToFormResults(
  election: Election,
  savedResults?: Tabulation.ManualElectionResults
): FormManualResults {
  const contestResults = Object.fromEntries(
    election.contests.map((contest) => [
      contest.id,
      savedResults?.contestResults[contest.id] ??
        emptyFormContestResults(contest),
    ])
  );
  return { contestResults };
}

function convertFormResultsToTabulationResults(
  formResults: FormManualResults
): Tabulation.ManualElectionResults {
  const contestResults = Object.fromEntries(
    Object.entries(formResults.contestResults).filter(
      ([, formContestResults]) => {
        const validationState = getContestValidationState(formContestResults);
        assert(validationState !== 'incomplete');
        return validationState !== 'empty';
      }
    )
  ) as Record<string, Tabulation.ContestResults>;

  const ballotCounts = Object.values(contestResults).map(
    ({ ballots }) => ballots
  );
  const ballotCount = ballotCounts.length > 0 ? Math.max(...ballotCounts) : 0;

  return { contestResults, ballotCount };
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
  const ballotStyle = find(
    getGroupedBallotStyles(election.ballotStyles),
    (bs) => bs.id === ballotStyleGroupId
  );
  const votingMethodTitle =
    votingMethod === 'absentee' ? 'Absentee' : 'Precinct';
  const history = useHistory();

  const setManualTallyMutation = setManualResults.useMutation();

  const initialManualResults = convertTabulationResultsToFormResults(
    election,
    savedManualResults?.manualResults
  );
  const [formManualResults, setFormManualResults] =
    useState<FormManualResults>(initialManualResults);

  const [formWriteInCandidates, setFormWriteInCandidates] = useState<
    FormWriteInCandidate[]
  >([]);

  function saveResults() {
    setManualTallyMutation.mutate(
      {
        precinctId,
        ballotStyleGroupId,
        votingMethod,
        manualResults: convertFormResultsToTabulationResults(formManualResults),
      },
      {
        onSuccess: () => {
          history.push(routerPaths.tallyManual);
        },
      }
    );
  }

  function updateManualResultsWithNewContestResults(
    newContestResults: FormContestResults
  ) {
    setFormManualResults({
      contestResults: {
        ...formManualResults.contestResults,
        [newContestResults.contestId]: newContestResults,
      },
    });
  }

  function getValueForInput(
    contestId: ContestId,
    dataKey: string
  ): number | EmptyValue {
    const contestResults = formManualResults.contestResults[contestId];
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
    const contestResults = formManualResults.contestResults[contestId];
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
        const newCandidateTally: FormCandidateTally = candidateTally
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

  function addFormWriteInCandidate(name: string, contestId: string): void {
    setFormWriteInCandidates([
      ...formWriteInCandidates,
      {
        id: `${AdminTypes.TEMPORARY_WRITE_IN_ID_PREFIX}(${name})`,
        name,
        contestId,
      },
    ]);
  }

  function removeFormWriteInCandidate(id: string, contestId: string): void {
    setFormWriteInCandidates(formWriteInCandidates.filter((c) => c.id !== id));

    // remove form candidate from contest
    const contestResults = formManualResults.contestResults[contestId];
    assert(contestResults.contestType === 'candidate');
    delete contestResults?.tallies[id];

    updateManualResultsWithNewContestResults(contestResults);
  }

  const currentContests = getContests({ election, ballotStyle });

  const contestValidationStates: Record<ContestId, ContestValidationState> = {};
  for (const contest of currentContests) {
    contestValidationStates[contest.id] = getContestValidationState(
      formManualResults.contestResults[contest.id]
    );
  }
  const someContestHasInvalidResults = Object.values(
    contestValidationStates
  ).some((s) => s === 'invalid');
  const someContestHasIncompleteResults = Object.values(
    contestValidationStates
  ).some((s) => s === 'incomplete');
  const someContestHasEmptyResults = Object.values(
    contestValidationStates
  ).some((s) => s === 'empty');

  return (
    <TaskScreen>
      <TaskControls style={{ width: '20rem' }}>
        <TaskHeader>
          <H1>{TITLE}</H1>
          <LinkButton
            icon="X"
            color="inverseNeutral"
            fill="transparent"
            to={routerPaths.tallyManual}
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
                {someContestHasInvalidResults ||
                someContestHasIncompleteResults ||
                someContestHasEmptyResults ? (
                  <Icons.Warning color="warning" />
                ) : (
                  <Icons.Checkbox color="success" />
                )}
              </div>
              {someContestHasInvalidResults
                ? 'At least one contest has invalid tallies entered'
                : someContestHasIncompleteResults
                ? 'At least one contest has incomplete tallies'
                : someContestHasEmptyResults
                ? 'At least one contest has no tallies entered'
                : 'All entered contest tallies are valid'}
            </FormStatus>
            <Actions>
              <LinkButton style={{ flex: 1 }} to={routerPaths.tallyManual}>
                Cancel
              </LinkButton>
              <Button
                variant="primary"
                icon="Done"
                onPress={saveResults}
                disabled={
                  someContestHasIncompleteResults ||
                  setManualTallyMutation.isLoading
                }
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
            const contestFormWriteInCandidates = formWriteInCandidates.filter(
              ({ contestId }) => contestId === contest.id
            );
            const disallowedNewWriteInCandidateNames =
              contest.type === 'candidate'
                ? [
                    ...contest.candidates,
                    ...contestWriteInCandidates,
                    ...contestFormWriteInCandidates,
                  ].map(({ name }) => normalizeWriteInName(name))
                : [];

            const contestValidationState = contestValidationStates[contest.id];

            return (
              <ContestData key={contest.id}>
                <Caption>{getContestDistrictName(election, contest)}</Caption>
                <H3>{contest.title}</H3>
                {(() => {
                  switch (contestValidationState) {
                    case 'empty':
                      return (
                        <P>
                          <Icons.Info /> No tallies entered
                        </P>
                      );
                    case 'incomplete':
                      return (
                        <P>
                          <Icons.Warning color="warning" /> Incomplete tallies
                        </P>
                      );
                    case 'invalid':
                      return (
                        <P>
                          <Icons.Warning color="warning" /> Entered tallies do
                          not match total ballots cast
                        </P>
                      );
                    case 'valid':
                      return (
                        <P>
                          <Icons.Checkbox color="success" /> Entered tallies are
                          valid
                        </P>
                      );
                    default:
                      throwIllegalValue(contestValidationState);
                  }
                })()}
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
                    {contestFormWriteInCandidates.map((candidate) => (
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
                            removeFormWriteInCandidate(
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
                      addFormWriteInCandidate(name, contest.id)
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
