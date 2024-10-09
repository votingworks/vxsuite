import {
  assert,
  assertDefined,
  mapObject,
  throwIllegalValue,
} from '@votingworks/basics';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Route, Switch, useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  ContestId,
  getContestDistrictName,
  getContests,
  Tabulation,
  CandidateId,
  Admin as AdminTypes,
  AnyContest,
  getPrecinctById,
  BallotStyleGroupId,
  Contests,
  Precinct,
} from '@votingworks/types';
import {
  Button,
  LinkButton,
  Icons,
  P,
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
  Callout,
  H3,
} from '@votingworks/ui';
import {
  format,
  getContestById,
  getBallotStyleGroup,
  areContestResultsValid,
} from '@votingworks/utils';

import type {
  ManualResultsRecord,
  ManualResultsVotingMethod,
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
import {
  ManualTallyFormContestParams,
  ManualTallyFormParams,
} from '../../config/types';

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
  ballotStyleGroupId,
  precinct,
  votingMethod,
}: {
  ballotStyleGroupId: BallotStyleGroupId;
  precinct: Precinct;
  votingMethod: Tabulation.VotingMethod;
}) {
  const votingMethodTitle =
    votingMethod === 'absentee' ? 'Absentee' : 'Precinct';
  return (
    <TallyMetadataContainer>
      <LabelledText label="Ballot Style">{ballotStyleGroupId}</LabelledText>
      <LabelledText label="Precinct">{precinct.name}</LabelledText>
      <LabelledText label="Voting Method">{votingMethodTitle}</LabelledText>
    </TallyMetadataContainer>
  );
}

const ValidationMessage = styled.div`
  padding: 0 1rem;

  svg {
    margin-right: 0.125rem;
  }
`;

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

const TallyInput = styled.input.attrs({ type: 'number' })`
  width: 5.5em;

  ::-webkit-inner-spin-button,
  ::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
`;

const ContestSection = styled.div<{ fill?: 'neutral' | 'warning' }>`
  background: ${(p) =>
    p.fill === 'neutral'
      ? p.theme.colors.container
      : p.fill === 'warning'
      ? p.theme.colors.warningContainer
      : undefined};
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
  readonly ballotCount: number | EmptyValue;
}

interface FormWriteInCandidate {
  readonly id: string;
  readonly name: string;
}

function emptyFormContestResults(
  contest: AnyContest,
  ballotCount?: number
): FormContestResults {
  switch (contest.type) {
    case 'yesno':
      return {
        contestId: contest.id,
        contestType: 'yesno',
        yesOptionId: contest.yesOption.id,
        noOptionId: contest.noOption.id,
        ballots: ballotCount ?? '',
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
        ballots: ballotCount ?? '',
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

    /* istanbul ignore next */
    default:
      throwIllegalValue(contest);
  }
}

type ValidationError = 'empty' | 'incomplete' | 'invalid';

function validateTallies(
  formContestResults: FormContestResults,
  isOverridingBallotCount: boolean
): ValidationError | undefined {
  const formValues = [
    ...(isOverridingBallotCount ? [formContestResults.ballots] : []),
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
  if (!areContestResultsValid(contestResults)) {
    return 'invalid';
  }
  return undefined;
}

function convertTabulationResultsToFormResults(
  contests: Contests,
  savedResults?: Tabulation.ManualElectionResults
): FormManualResults {
  const contestResults = Object.fromEntries(
    contests.map((contest) => [
      contest.id,
      savedResults?.contestResults[contest.id] ??
        emptyFormContestResults(contest, savedResults?.ballotCount),
    ])
  );
  return { contestResults, ballotCount: savedResults?.ballotCount ?? '' };
}

function convertFormResultsToTabulationResults(
  formResults: FormManualResults
): Tabulation.ManualElectionResults {
  assert(formResults.ballotCount !== '');
  const validContestResults = Object.fromEntries(
    Object.entries(formResults.contestResults).filter(
      ([, formContestResults]) => {
        const isOverridingBallotCount =
          formContestResults.ballots !== formResults.ballotCount;
        const validationError = validateTallies(
          formContestResults,
          isOverridingBallotCount
        );
        assert(validationError !== 'incomplete');
        return validationError !== 'empty';
      }
    )
  );

  return {
    contestResults: validContestResults as Record<
      string,
      Tabulation.ContestResults
    >,
    ballotCount: formResults.ballotCount,
  };
}

function BallotCountForm({
  savedManualResults,
}: {
  savedManualResults: ManualResultsRecord | null;
}): JSX.Element {
  const { precinctId, ballotStyleGroupId, votingMethod } =
    useParams<ManualTallyFormParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const precinct = assertDefined(getPrecinctById({ election, precinctId }));
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({ election, ballotStyleGroupId })
  );
  const contests = getContests({ election, ballotStyle: ballotStyleGroup });

  const initialManualResults = convertTabulationResultsToFormResults(
    contests,
    savedManualResults?.manualResults
  );
  const [ballotCount, setBallotCount] = useState<number | EmptyValue>(
    initialManualResults.ballotCount
  );

  const setManualTallyMutation = setManualResults.useMutation();
  const history = useHistory();

  async function saveBallotCount() {
    assert(ballotCount !== '');
    await setManualTallyMutation.mutateAsync({
      precinctId,
      ballotStyleGroupId,
      votingMethod,
      manualResults: convertFormResultsToTabulationResults({
        ballotCount,
        contestResults: mapObject(
          initialManualResults.contestResults,
          (contestResults) => ({
            ...contestResults,
            ballots: ballotCount,
          })
        ),
      }),
    });
    history.push(
      routerPaths.tallyManualFormContest({
        precinctId,
        ballotStyleGroupId,
        votingMethod,
        contestId: contests[0].id,
      })
    );
  }

  const hasOverrides = Object.values(initialManualResults.contestResults).some(
    (contestResults) =>
      contestResults.ballots !== initialManualResults.ballotCount
  );

  return (
    <TaskScreen>
      <TallyTaskContent>
        {hasOverrides && (
          <Callout icon="Warning" color="warning">
            Changing the total ballots cast will remove contest overrides.
          </Callout>
        )}
        <FormCard>
          <label htmlFor="ballotCount">
            <H3>Total Ballots Cast</H3>
          </label>
          <TallyInput
            autoFocus
            id="ballotCount"
            type="number"
            value={ballotCount}
            onChange={(event) =>
              setBallotCount(
                event.currentTarget.value === ''
                  ? ''
                  : event.currentTarget.valueAsNumber
              )
            }
          />
        </FormCard>
      </TallyTaskContent>
      <TallyTaskControls>
        <TallyTaskHeader />
        <ControlsContent>
          <TallyMetadata
            ballotStyleGroupId={ballotStyleGroupId}
            precinct={precinct}
            votingMethod={votingMethod}
          />
          <Actions>
            <LinkButton to={routerPaths.tallyManual}>Cancel</LinkButton>
            <Button
              variant="primary"
              icon="Done"
              onPress={saveBallotCount}
              disabled={ballotCount === '' || setManualTallyMutation.isLoading}
            >
              Save & Next
            </Button>
          </Actions>
        </ControlsContent>
      </TallyTaskControls>
    </TaskScreen>
  );
}

function ContestForm({
  savedWriteInCandidates,
  savedManualResults,
}: {
  savedWriteInCandidates: WriteInCandidateRecord[];
  savedManualResults: ManualResultsRecord;
}): JSX.Element {
  const { precinctId, ballotStyleGroupId, votingMethod, contestId } =
    useParams<ManualTallyFormContestParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const precinct = assertDefined(getPrecinctById({ election, precinctId }));
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({ election, ballotStyleGroupId })
  );

  const contest = getContestById(electionDefinition, contestId);
  const contests = getContests({ election, ballotStyle: ballotStyleGroup });
  const contestIndex = contests.indexOf(contest);
  const nextContest = contests[contestIndex + 1];
  const previousContest = contests[contestIndex - 1];

  const history = useHistory();

  const setManualTallyMutation = setManualResults.useMutation();

  const initialManualResults = convertTabulationResultsToFormResults(
    contests,
    savedManualResults.manualResults
  );
  const [formManualResults, setFormManualResults] =
    useState<FormManualResults>(initialManualResults);
  const [formWriteInCandidates, setFormWriteInCandidates] = useState<
    FormWriteInCandidate[]
  >([]);
  const [isOverridingBallotCount, setIsOverridingBallotCount] = useState(
    formManualResults.contestResults[contestId].ballots !==
      formManualResults.ballotCount
  );
  const firstInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    assertDefined(firstInputRef.current).focus();
  }, []);

  async function saveResults() {
    await setManualTallyMutation.mutateAsync({
      precinctId,
      ballotStyleGroupId,
      votingMethod,
      manualResults: convertFormResultsToTabulationResults(formManualResults),
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

  function updateManualResultsWithNewContestResults(
    newContestResults: FormContestResults
  ) {
    setFormManualResults({
      ...formManualResults,
      contestResults: {
        ...formManualResults.contestResults,
        [newContestResults.contestId]: newContestResults,
      },
    });
  }

  function getValueForInput(dataKey: string): number | EmptyValue {
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
        return contestResults.tallies[dataKey]?.tally ?? '';
    }
  }

  function updateContestData(
    dataKey: string,
    event: React.FormEvent<HTMLInputElement>,
    candidateName?: string
  ) {
    const contestResults = formManualResults.contestResults[contestId];
    const value =
      event.currentTarget.value === '' ? '' : event.currentTarget.valueAsNumber;
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
      case 'noTally':
      case 'yesTally':
        assert(contestResults.contestType === 'yesno');
        assert(newContestResults.contestType === 'yesno');
        if (dataKey === 'yesTally') {
          newContestResults = {
            ...contestResults,
            yesTally: value,
          };
        } else {
          newContestResults = {
            ...contestResults,
            noTally: value,
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

    updateManualResultsWithNewContestResults(newContestResults);
  }

  function addFormWriteInCandidate(name: string): void {
    const writeInCandidate: FormWriteInCandidate = {
      id: `${AdminTypes.TEMPORARY_WRITE_IN_ID_PREFIX}(${name})`,
      name,
    };
    setFormWriteInCandidates([...formWriteInCandidates, writeInCandidate]);
    const contestResults = formManualResults.contestResults[contestId];
    assert(contestResults.contestType === 'candidate');
    updateManualResultsWithNewContestResults({
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
    const contestResults = formManualResults.contestResults[contestId];
    assert(contestResults.contestType === 'candidate');
    delete contestResults.tallies[id];

    updateManualResultsWithNewContestResults(contestResults);
  }

  const validationError = validateTallies(
    formManualResults.contestResults[contestId],
    isOverridingBallotCount
  );

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
          <Caption>{getContestDistrictName(election, contest)}</Caption>
          <H2 style={{ marginTop: 0 }}>{contest.title}</H2>
          <ContestSection
            fill={isOverridingBallotCount ? 'warning' : 'neutral'}
          >
            <ContestDataRow>
              <TallyInput
                id="numBallots"
                value={getValueForInput('numBallots')}
                onChange={(e) => updateContestData('numBallots', e)}
                disabled={!isOverridingBallotCount}
                style={{ fontWeight: '500' }}
              />
              <label htmlFor="numBallots">
                <Font weight="bold">Total Ballots Cast</Font>
              </label>
              <div style={{ marginLeft: 'auto' }}>
                {isOverridingBallotCount ? (
                  <Button
                    onPress={() => {
                      updateManualResultsWithNewContestResults({
                        ...formManualResults.contestResults[contestId],
                        ballots: formManualResults.ballotCount,
                      });
                      setIsOverridingBallotCount(false);
                    }}
                    icon="X"
                    fill="transparent"
                  >
                    Remove Override
                  </Button>
                ) : (
                  <Button
                    onPress={() => setIsOverridingBallotCount(true)}
                    icon="Edit"
                    fill="transparent"
                  >
                    Override
                  </Button>
                )}
              </div>
            </ContestDataRow>
          </ContestSection>

          <ContestSection>
            <ContestDataRow>
              <TallyInput
                ref={firstInputRef}
                id="undervotes"
                value={getValueForInput('undervotes')}
                onChange={(e) => updateContestData('undervotes', e)}
              />
              <label htmlFor="undervotes">Undervotes</label>
            </ContestDataRow>
            <ContestDataRow>
              <TallyInput
                id="overvotes"
                value={getValueForInput('overvotes')}
                onChange={(e) => updateContestData('overvotes', e)}
              />
              <label htmlFor="overvotes">Overvotes</label>
            </ContestDataRow>
          </ContestSection>

          <ContestSection>
            {contest.type === 'candidate' && (
              <React.Fragment>
                {contest.candidates
                  .filter((c) => !c.isWriteIn)
                  .map((candidate) => (
                    <ContestDataRow key={candidate.id}>
                      <TallyInput
                        id={candidate.id}
                        value={getValueForInput(candidate.id)}
                        onChange={(e) => updateContestData(candidate.id, e)}
                      />
                      <label htmlFor={`${candidate.id}`}>
                        {candidate.name}
                      </label>
                    </ContestDataRow>
                  ))}
                {contestWriteInCandidates.map((candidate) => (
                  <ContestDataRow key={candidate.id}>
                    <TallyInput
                      id={candidate.id}
                      value={getValueForInput(candidate.id)}
                      onChange={(e) =>
                        updateContestData(candidate.id, e, candidate.name)
                      }
                    />
                    <label htmlFor={candidate.id}>
                      {candidate.name} (write-in)
                    </label>
                  </ContestDataRow>
                ))}
                {formWriteInCandidates.map((candidate) => (
                  <ContestDataRow key={candidate.id}>
                    <TallyInput
                      autoFocus
                      id={candidate.id}
                      value={getValueForInput(candidate.id)}
                      onChange={(e) =>
                        updateContestData(candidate.id, e, candidate.name)
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
                <ContestDataRow>
                  <TallyInput
                    id="yes"
                    value={getValueForInput('yesTally')}
                    onChange={(e) => updateContestData('yesTally', e)}
                  />
                  <label htmlFor="yes">{contest.yesOption.label}</label>
                </ContestDataRow>
                <ContestDataRow>
                  <TallyInput
                    id="no"
                    value={getValueForInput('noTally')}
                    onChange={(e) => updateContestData('noTally', e)}
                  />
                  <label htmlFor="no">{contest.noOption.label}</label>
                </ContestDataRow>
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
            ballotStyleGroupId={ballotStyleGroupId}
            precinct={precinct}
            votingMethod={votingMethod}
          />
          <div>
            <ValidationMessage>
              {(() => {
                switch (validationError) {
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
                        <Icons.Warning color="warning" /> Entered tallies do not
                        match total ballots cast
                      </P>
                    );
                  case undefined:
                    return (
                      <P>
                        <Icons.Checkbox color="success" /> Entered tallies are
                        valid
                      </P>
                    );
                  /* istanbul ignore next */
                  default:
                    throwIllegalValue(validationError);
                }
              })()}
            </ValidationMessage>
            <Actions>
              <Button
                icon="Previous"
                onPress={() => {
                  history.push(
                    previousContest
                      ? routerPaths.tallyManualFormContest({
                          precinctId,
                          ballotStyleGroupId,
                          votingMethod,
                          contestId: previousContest.id,
                        })
                      : routerPaths.tallyManualForm({
                          precinctId,
                          ballotStyleGroupId,
                          votingMethod,
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
                disabled={
                  validationError === 'incomplete' ||
                  setManualTallyMutation.isLoading
                }
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
      savedManualResults={assertDefined(savedManualResults)}
      key={contestId}
    />
  );
}

export function ManualTalliesFormScreen(): JSX.Element | null {
  const { precinctId, ballotStyleGroupId, votingMethod } =
    useParams<ManualTallyFormParams>();
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
    <Switch>
      <Route
        exact
        path={routerPaths.tallyManualForm({
          precinctId: ':precinctId',
          ballotStyleGroupId: ':ballotStyleGroupId' as BallotStyleGroupId,
          votingMethod: ':votingMethod' as ManualResultsVotingMethod,
        })}
      >
        <BallotCountForm
          savedManualResults={getManualResultsQuery.data}
          // Make sure we don't cache the form state from previous manual tally entry
          key={getManualResultsQuery.dataUpdatedAt}
        />
      </Route>
      <Route
        exact
        path={routerPaths.tallyManualFormContest({
          precinctId: ':precinctId',
          ballotStyleGroupId: ':ballotStyleGroupId' as BallotStyleGroupId,
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
