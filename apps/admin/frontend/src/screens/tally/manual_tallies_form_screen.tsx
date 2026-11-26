import {
  assert,
  assertDefined,
  find,
  iter,
  mapObject,
  throwIllegalValue,
} from '@votingworks/basics';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import styled from 'styled-components';
import {
  type ContestOptionId,
  getContestDistrictName,
  getContests,
  type Tabulation,
  type CandidateId,
  Admin as AdminTypes,
  type Contest,
  getPrecinctById,
  type BallotStyleGroupId,
  type Precinct,
  type Election,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import {
  Button,
  LinkButton,
  Icons,
  Card,
  Caption,
  LabelledText,
  H1,
  TaskContent,
  TaskControls,
  TaskHeader,
  TaskScreen,
  H2,
  Font,
  NumberInput,
} from '@votingworks/ui';
import {
  format,
  getBallotStyleGroup,
  uniqueCandidateOptions,
  contestOptionName,
} from '@votingworks/utils';

import type {
  ManualResultsRecord,
  ManualResultsVotingMethod,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import { routerPaths } from '../../router_paths.js';

import { AppContext } from '../../contexts/app_context.js';

import {
  getCandidateOrderings,
  getManualResults,
  getWriteInCandidates,
  setManualResults,
} from '../../api.js';
import { normalizeWriteInName } from '../../utils/adjudication.js';
import type {
  ManualTallyFormContestParams,
  ManualTallyFormParams,
} from '../../config/types.js';
import {
  BallotStyleLabel,
  VotingMethodLabel,
} from './manual_tallies_shared_components.js';

const TallyTaskControls = styled(TaskControls)`
  width: 25rem;
`;

const ControlsContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  justify-content: space-between;
  flex: 1;
`;

function TallyTaskHeader() {
  return (
    <TaskHeader>
      <H1>Edit Tallies</H1>
      <LinkButton
        icon="X"
        color="inverseNeutral"
        fill="transparent"
        to={routerPaths.tallyManual}
        tabIndex={-1}
      >
        Close
      </LinkButton>
    </TaskHeader>
  );
}

const TallyMetadataContainer = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

function TallyMetadata({
  election,
  ballotStyleGroupId,
  precinct,
  votingMethod,
}: {
  election: Election;
  ballotStyleGroupId: BallotStyleGroupId;
  precinct: Precinct;
  votingMethod: ManualResultsVotingMethod;
}) {
  return (
    <TallyMetadataContainer>
      <LabelledText label="Ballot Style">
        <BallotStyleLabel
          election={election}
          ballotStyleGroupId={ballotStyleGroupId}
          precinctId={precinct.id}
        />
      </LabelledText>
      <LabelledText label="Voting Method">
        <VotingMethodLabel votingMethod={votingMethod} />{' '}
      </LabelledText>
    </TallyMetadataContainer>
  );
}

const VoteTotalsContainer = styled.div`
  padding: 0 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  svg {
    margin-right: 0.125rem;
  }
`;

const VoteTotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
`;

function VoteTotalsSummary({
  ballots,
  voteTotals,
}: {
  ballots: number;
  voteTotals: VoteTotals;
}): JSX.Element {
  const { isEmpty, votesAllowed, expected, entered } = voteTotals;
  const difference = entered - expected;
  return (
    <VoteTotalsContainer>
      <div>
        <VoteTotalRow>
          <span>Votes expected</span>
          <Font weight="semiBold">{format.count(expected)}</Font>
        </VoteTotalRow>
        {votesAllowed > 1 && (
          <Caption>
            {format.count(ballots)} {ballots === 1 ? 'ballot' : 'ballots'} ×{' '}
            {votesAllowed}
          </Caption>
        )}
      </div>
      <VoteTotalRow>
        <span>Votes entered</span>
        <Font weight="semiBold">{format.count(entered)}</Font>
      </VoteTotalRow>
      {isEmpty ? (
        <div>
          <Icons.Info /> No tallies entered
        </div>
      ) : difference === 0 ? (
        <div>
          <Icons.Checkbox color="success" /> Entered votes match expected
        </div>
      ) : (
        <Font weight="semiBold">
          <Icons.Warning color="warning" /> {format.count(Math.abs(difference))}{' '}
          {Math.abs(difference) === 1 ? 'vote' : 'votes'}{' '}
          {difference < 0 ? 'too few' : 'too many'}
        </Font>
      )}
    </VoteTotalsContainer>
  );
}

const Actions = styled.div`
  padding: 1rem;
  background: ${(p) => p.theme.colors.containerLow};
  display: flex;
  gap: 1rem;
  align-items: center;

  button {
    flex: 1;
    flex-wrap: nowrap;
    white-space: nowrap;
  }
`;

const TallyTaskContent = styled(TaskContent)`
  background: ${(p) => p.theme.colors.containerHigh};
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`;

const FormCard = styled(Card)`
  background: ${(p) => p.theme.colors.background};
`;

const ContestSection = styled.div<{ fill?: 'neutral' }>`
  background: ${(p) =>
    p.fill === 'neutral' ? p.theme.colors.container : undefined};
  border-top: ${(p) => p.theme.sizes.bordersRem.thick}rem double
    ${(p) => p.theme.colors.outline};

  &:last-child {
    border-bottom: ${(p) => p.theme.sizes.bordersRem.thick}rem double
      ${(p) => p.theme.colors.outline};
  }
`;

const ContestDataRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;

  &:not(:first-child) {
    border-top: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
  }
`;

function AddWriteInRow({
  addWriteInCandidate,
  disallowedCandidateNames,
}: {
  addWriteInCandidate: (name: string) => void;
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
          aria-label="Write-in"
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
  'ballots' | 'overvotes' | 'undervotes' | 'tallies'
> &
  FormContestResultsMetadata & {
    tallies: Record<ContestOptionId, InputValue>;
  };

type FormCandidateContestResults = Omit<
  Tabulation.CandidateContestResults,
  'ballots' | 'overvotes' | 'undervotes' | 'tallies'
> &
  FormContestResultsMetadata & {
    tallies: Record<CandidateId, FormCandidateTally>;
  };

type FormContestResults = FormYesNoContestResults | FormCandidateContestResults;

interface FormWriteInCandidate {
  readonly id: string;
  readonly name: string;
}

function emptyFormContestResults(
  contest: Contest,
  ballots: InputValue
): FormContestResults {
  // @coverage-exclude
  if (contest.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
  switch (contest.type) {
    case 'yesno':
      return {
        contestId: contest.id,
        contestType: 'yesno',
        ballots,
        overvotes: '',
        undervotes: '',
        tallies: Object.fromEntries(
          contest.options.map((option) => [option.id, ''])
        ),
      };

    case 'candidate':
      return {
        contestId: contest.id,
        contestType: 'candidate',
        votesAllowed: contest.seats,
        ballots,
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

    default: {
      throwIllegalValue(contest);
    }
  }
}

function valueOrZero(value: InputValue): number {
  return value === '' ? 0 : value;
}

function convertFormContestResultsToTabulationContestResults(
  formContestResults: FormContestResults
): Tabulation.ContestResults {
  const metadata: Pick<
    Tabulation.ContestResults,
    'ballots' | 'overvotes' | 'undervotes'
  > = {
    ballots: valueOrZero(formContestResults.ballots),
    overvotes: valueOrZero(formContestResults.overvotes),
    undervotes: valueOrZero(formContestResults.undervotes),
  };
  switch (formContestResults.contestType) {
    case 'yesno':
      return {
        ...formContestResults,
        ...metadata,
        tallies: mapObject(formContestResults.tallies, valueOrZero),
      };
    case 'candidate':
      return {
        ...formContestResults,
        ...metadata,
        tallies: mapObject(formContestResults.tallies, (candidateTally) => ({
          ...candidateTally,
          tally: valueOrZero(candidateTally.tally),
        })),
      };
    default: {
      throwIllegalValue(formContestResults);
    }
  }
}

interface VoteTotals {
  readonly isEmpty: boolean;
  readonly votesAllowed: number;
  readonly expected: number;
  readonly entered: number;
}

function getVoteTotals(formContestResults: FormContestResults): VoteTotals {
  const tallyValues = [
    formContestResults.overvotes,
    formContestResults.undervotes,
    ...(formContestResults.contestType === 'candidate'
      ? Object.values(formContestResults.tallies).map(({ tally }) => tally)
      : Object.values(formContestResults.tallies)),
  ];
  const votesAllowed =
    formContestResults.contestType === 'candidate'
      ? formContestResults.votesAllowed
      : 1;
  return {
    isEmpty: tallyValues.every((v) => v === ''),
    votesAllowed,
    expected: valueOrZero(formContestResults.ballots) * votesAllowed,
    entered: iter(tallyValues).map(valueOrZero).sum(),
  };
}

function getManualTallyContests(
  election: Election,
  ballotStyleGroupId: BallotStyleGroupId
): Contest[] {
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({ election, ballotStyleGroupId })
  );
  return getContests({ election, ballotStyle: ballotStyleGroup }).filter(
    (c) => c.type !== 'straight-party'
  );
}

function ContestForm({
  savedWriteInCandidates,
  savedManualResults,
}: {
  savedWriteInCandidates: WriteInCandidateRecord[];
  savedManualResults: ManualResultsRecord | null;
}): React.ReactNode {
  const { precinctId, ballotStyleGroupId, votingMethod, contestId } =
    useParams<ManualTallyFormContestParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const precinct = assertDefined(getPrecinctById({ election, precinctId }));
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({ election, ballotStyleGroupId })
  );

  const candidateOrderingsQuery = getCandidateOrderings.useQuery({
    ballotStyleGroupId: ballotStyleGroup.id,
  });

  const contests = getManualTallyContests(election, ballotStyleGroupId);
  const contest = find(contests, (c) => c.id === contestId);
  const contestIndex = contests.indexOf(contest);
  const nextContest = contests[contestIndex + 1];
  const previousContest = contests[contestIndex - 1];

  const history = useHistory();

  const setManualTallyMutation = setManualResults.useMutation();

  const savedContestResults = savedManualResults?.manualResults.contestResults;
  const [formContestResults, setFormContestResults] =
    useState<FormContestResults>(() => {
      const savedResults = savedContestResults?.[contestId];
      assert(
        savedResults?.contestType !== 'straight-party',
        'Straight party contests are not yet supported for manual tallies'
      );
      if (savedResults) return savedResults;
      const previousEnteredContest = contests
        .slice(0, contestIndex)
        .findLast((c) => savedContestResults?.[c.id]);
      return emptyFormContestResults(
        contest,
        previousEnteredContest
          ? assertDefined(savedContestResults?.[previousEnteredContest.id])
              .ballots
          : ''
      );
    });
  const [formWriteInCandidates, setFormWriteInCandidates] = useState<
    FormWriteInCandidate[]
  >([]);
  const firstInputRef = React.useRef<HTMLInputElement>(null);

  const isLoaded = candidateOrderingsQuery.isSuccess;
  useEffect(() => {
    firstInputRef.current?.focus();
  }, [isLoaded]);

  if (!candidateOrderingsQuery.isSuccess) {
    return null;
  }

  const candidateOrderings = candidateOrderingsQuery.data;

  async function saveResults() {
    const contestResults: Tabulation.ManualElectionResults['contestResults'] = {
      ...(savedContestResults ?? {}),
      [contestId]:
        convertFormContestResultsToTabulationContestResults(formContestResults),
    };
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstContestResults = contestResults[contests[0]!.id];
    await setManualTallyMutation.mutateAsync({
      precinctId,
      ballotStyleGroupId,
      votingMethod,
      manualResults: {
        ballotCount: firstContestResults
          ? firstContestResults.ballots
          : assertDefined(savedManualResults).manualResults.ballotCount,
        contestResults,
      },
    });
    history.push(
      nextContest
        ? routerPaths.tallyManualFormContest({
            precinctId,
            ballotStyleGroupId,
            votingMethod,
            contestId: nextContest.id,
          })
        : routerPaths.tallyManual
    );
  }

  function getValueForInput(dataKey: string): number | EmptyValue {
    const contestResults = formContestResults;
    switch (dataKey) {
      case 'numBallots':
        return contestResults.ballots;
      case 'overvotes':
        return contestResults.overvotes;
      case 'undervotes':
        return contestResults.undervotes;
      default:
        if (contestResults.contestType === 'yesno') {
          // @coverage-defer
          return contestResults.tallies[dataKey] ?? '';
        }
        assert(contestResults.contestType === 'candidate');
        return contestResults.tallies[dataKey]?.tally ?? '';
    }
  }

  function updateContestData(
    dataKey: string,
    value: number | EmptyValue,
    candidateName?: string
  ) {
    const contestResults = formContestResults;
    let newContestResults = contestResults;
    switch (dataKey) {
      case 'overvotes':
        newContestResults = {
          ...contestResults,
          overvotes: value,
        };
        break;
      case 'undervotes':
        newContestResults = {
          ...contestResults,
          undervotes: value,
        };
        break;
      case 'numBallots':
        newContestResults = {
          ...contestResults,
          ballots: value,
        };
        break;
      default: {
        if (contestResults.contestType === 'yesno') {
          assert(newContestResults.contestType === 'yesno');
          newContestResults = {
            ...contestResults,
            tallies: {
              ...contestResults.tallies,
              [dataKey]: value,
            },
          };
          break;
        }
        assert(contestResults.contestType === 'candidate');
        assert(newContestResults.contestType === 'candidate');
        const candidateTally = contestResults.tallies[dataKey];
        const newCandidateTally: FormCandidateTally = candidateTally
          ? {
              ...candidateTally,
              tally: value,
            }
          : {
              id: dataKey,
              isWriteIn: true,
              name: assertDefined(candidateName),
              tally: value,
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

    setFormContestResults(newContestResults);
  }

  function addFormWriteInCandidate(name: string): void {
    const writeInCandidate: FormWriteInCandidate = {
      id: `${AdminTypes.TEMPORARY_WRITE_IN_ID_PREFIX}(${name})`,
      name,
    };
    setFormWriteInCandidates([...formWriteInCandidates, writeInCandidate]);
    const contestResults = formContestResults;
    assert(contestResults.contestType === 'candidate');
    setFormContestResults({
      ...contestResults,
      tallies: {
        ...contestResults.tallies,
        [writeInCandidate.id]: {
          id: writeInCandidate.id,
          name: writeInCandidate.name,
          isWriteIn: true,
          tally: '',
        },
      },
    });
  }

  function removeFormWriteInCandidate(id: string): void {
    setFormWriteInCandidates(formWriteInCandidates.filter((c) => c.id !== id));

    // remove form candidate from contest
    const contestResults = formContestResults;
    assert(contestResults.contestType === 'candidate');
    const { [id]: _removedTally, ...tallies } = contestResults.tallies;
    setFormContestResults({ ...contestResults, tallies });
  }

  const contestWriteInCandidates = savedWriteInCandidates.filter(
    (candidate) => candidate.contestId === contestId
  );
  const disallowedNewWriteInCandidateNames =
    contest.type === 'candidate'
      ? [
          ...contest.candidates,
          ...contestWriteInCandidates,
          ...formWriteInCandidates,
        ].map(({ name }) => normalizeWriteInName(name))
      : [];

  return (
    <TaskScreen>
      <TallyTaskContent>
        <FormCard>
          <div style={{ marginBottom: '0.5rem' }}>
            <Caption>{getContestDistrictName(election, contest)}</Caption>
            <H2 style={{ margin: 0 }}>{contest.title}</H2>
            {contest.type === 'candidate' && (
              <div>Vote for {contest.seats}</div>
            )}
          </div>
          <ContestSection fill="neutral">
            <ContestDataRow>
              <NumberInput
                inputRef={
                  formContestResults.ballots === '' ? firstInputRef : undefined
                }
                id="numBallots"
                value={getValueForInput('numBallots')}
                onChange={(value) => updateContestData('numBallots', value)}
                style={{ fontWeight: '500' }}
              />
              <label htmlFor="numBallots">
                <Font weight="bold">Ballot Count</Font>
              </label>
            </ContestDataRow>
          </ContestSection>

          <ContestSection>
            <ContestDataRow>
              <NumberInput
                inputRef={
                  formContestResults.ballots === '' ? undefined : firstInputRef
                }
                id="undervotes"
                value={getValueForInput('undervotes')}
                onChange={(value) => updateContestData('undervotes', value)}
              />
              <label htmlFor="undervotes">Undervotes</label>
            </ContestDataRow>
            <ContestDataRow>
              <NumberInput
                id="overvotes"
                value={getValueForInput('overvotes')}
                onChange={(value) => updateContestData('overvotes', value)}
              />
              <label htmlFor="overvotes">Overvotes</label>
              {contest.type === 'candidate' && contest.seats > 1 && (
                <Caption style={{ marginLeft: 'auto' }}>
                  Enter {contest.seats} for each overvoted ballot
                </Caption>
              )}
            </ContestDataRow>
          </ContestSection>

          <ContestSection>
            {contest.type === 'candidate' && (
              <React.Fragment>
                {[...uniqueCandidateOptions(contest, candidateOrderings)]
                  .filter((c) => !c.isWriteIn)
                  .map((candidate) => (
                    <ContestDataRow key={candidate.id}>
                      <NumberInput
                        id={candidate.id}
                        value={getValueForInput(candidate.id)}
                        onChange={(value) =>
                          updateContestData(candidate.id, value)
                        }
                      />
                      <label htmlFor={`${candidate.id}`}>
                        {contestOptionName(election, contest, candidate)}
                      </label>
                    </ContestDataRow>
                  ))}
                {contestWriteInCandidates.map((candidate) => (
                  <ContestDataRow key={candidate.id}>
                    <NumberInput
                      id={candidate.id}
                      value={getValueForInput(candidate.id)}
                      onChange={(value) =>
                        updateContestData(candidate.id, value, candidate.name)
                      }
                    />
                    <label htmlFor={candidate.id}>
                      {candidate.name} (write-in)
                    </label>
                  </ContestDataRow>
                ))}
                {formWriteInCandidates.map((candidate) => (
                  <ContestDataRow key={candidate.id}>
                    <NumberInput
                      autoFocus
                      id={candidate.id}
                      value={getValueForInput(candidate.id)}
                      onChange={(value) =>
                        updateContestData(candidate.id, value, candidate.name)
                      }
                    />
                    <label htmlFor={candidate.id}>
                      {candidate.name} (write-in)
                    </label>
                    <Button
                      icon="X"
                      variant="danger"
                      fill="transparent"
                      onPress={() => {
                        removeFormWriteInCandidate(candidate.id);
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
                {contest.options.map((option) => (
                  <ContestDataRow key={option.id}>
                    <NumberInput
                      id={option.id}
                      value={getValueForInput(option.id)}
                      onChange={(value) => updateContestData(option.id, value)}
                    />
                    <label htmlFor={option.id}>{option.label}</label>
                  </ContestDataRow>
                ))}
              </React.Fragment>
            )}
            {contest.type === 'candidate' && contest.allowWriteIns && (
              <AddWriteInRow
                addWriteInCandidate={addFormWriteInCandidate}
                disallowedCandidateNames={disallowedNewWriteInCandidateNames}
              />
            )}
          </ContestSection>
        </FormCard>
      </TallyTaskContent>

      <TallyTaskControls>
        <TallyTaskHeader />
        <ControlsContent>
          <TallyMetadata
            election={election}
            ballotStyleGroupId={ballotStyleGroupId}
            precinct={precinct}
            votingMethod={votingMethod}
          />
          <div>
            <VoteTotalsSummary
              ballots={valueOrZero(formContestResults.ballots)}
              voteTotals={getVoteTotals(formContestResults)}
            />
            <Actions>
              <Button
                icon="Previous"
                disabled={!previousContest}
                onPress={() => {
                  history.push(
                    routerPaths.tallyManualFormContest({
                      precinctId,
                      ballotStyleGroupId,
                      votingMethod,
                      contestId: assertDefined(previousContest).id,
                    })
                  );
                }}
              >
                Previous
              </Button>
              <Caption weight="semiBold" style={{ whiteSpace: 'nowrap' }}>
                {format.count(contestIndex + 1)} of{' '}
                {format.count(contests.length)}
              </Caption>
              <Button
                variant="primary"
                icon="Done"
                onPress={saveResults}
                disabled={setManualTallyMutation.isLoading}
              >
                {nextContest ? 'Save & Next' : 'Finish'}
              </Button>
            </Actions>
          </div>
        </ControlsContent>
      </TallyTaskControls>
    </TaskScreen>
  );
}

function ContestFormWrapper({
  savedWriteInCandidates,
  savedManualResults,
}: {
  savedWriteInCandidates: WriteInCandidateRecord[];
  savedManualResults: ManualResultsRecord | null;
}): JSX.Element {
  const { contestId } = useParams<ManualTallyFormContestParams>();

  return (
    <ContestForm
      savedWriteInCandidates={savedWriteInCandidates}
      savedManualResults={savedManualResults}
      key={contestId}
    />
  );
}

export function ManualTalliesFormScreen(): JSX.Element | null {
  const { precinctId, ballotStyleGroupId, votingMethod } =
    useParams<ManualTallyFormParams>();
  const getWriteInCandidatesQuery = getWriteInCandidates.usePollingQuery();
  const getManualResultsQuery = getManualResults.useQuery({
    precinctId,
    ballotStyleGroupId,
    votingMethod,
  });

  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const contests = getManualTallyContests(
    electionDefinition.election,
    ballotStyleGroupId
  );

  if (
    !getWriteInCandidatesQuery.isSuccess ||
    !getManualResultsQuery.isSuccess
  ) {
    return null;
  }

  return (
    <Switch>
      <Route
        exact
        path={routerPaths.tallyManualForm({
          precinctId: ':precinctId',
          ballotStyleGroupId: ':ballotStyleGroupId',
          votingMethod: ':votingMethod' as ManualResultsVotingMethod,
        })}
      >
        <Redirect
          to={routerPaths.tallyManualFormContest({
            precinctId,
            ballotStyleGroupId,
            votingMethod,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            contestId: contests[0]!.id,
          })}
        />
      </Route>
      <Route
        exact
        path={routerPaths.tallyManualFormContest({
          precinctId: ':precinctId',
          ballotStyleGroupId: ':ballotStyleGroupId',
          votingMethod: ':votingMethod' as ManualResultsVotingMethod,
          contestId: ':contestId',
        })}
      >
        <ContestFormWrapper
          savedWriteInCandidates={getWriteInCandidatesQuery.data}
          savedManualResults={getManualResultsQuery.data}
          // Make sure we don't cache the form state from previous manual tally entry
          key={getManualResultsQuery.dataUpdatedAt}
        />
      </Route>
    </Switch>
  );
}
