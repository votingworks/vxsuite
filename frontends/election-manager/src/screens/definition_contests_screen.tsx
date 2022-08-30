import { assert } from '@votingworks/utils';
import React, { useContext } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import DomPurify from 'dompurify';
import {
  Election,
  CandidateContest,
  YesNoContest,
  AnyContest,
  MsEitherNeitherContest,
  ContestId,
  PartyIdSchema,
  unsafeParse,
} from '@votingworks/types';

import { Button, SegmentedButton, Prose, Text } from '@votingworks/ui';
import { readFileAsync } from '../lib/read_file_async';
import {
  EventTargetFunction,
  InputEventFunction,
  TextareaEventFunction,
} from '../config/types';

import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  CandidateContestChoices,
  Contest,
} from '../components/hand_marked_paper_ballot';
import { TextInput } from '../components/text_input';
import { TextareaAutosize } from '../components/textarea';
import { BubbleMark } from '../components/bubble_mark';
import { FileInputButton } from '../components/file_input_button';

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Columns = styled.div`
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  > div:first-child {
    margin-left: 1rem;
  }
  > div:last-child {
    flex: 1;
  }
`;

const RenderedContest = styled.div`
  position: sticky;
  top: 0;
`;
const Paper = styled.div<{ isNarrow?: boolean }>`
  background: #ffffff;
  width: ${({ isNarrow }) => (isNarrow ? '312px' : '477px')};
  font-size: 18px;
  > div {
    margin-bottom: 0;
  }
`;

const StyledField = styled.div`
  margin-bottom: 0.75rem;
  label {
    display: block;
    font-size: 0.85rem;
  }
`;
function TextField({
  disabled = false,
  name,
  label = name,
  min,
  onChange,
  optional,
  pattern,
  step,
  type = 'text',
  value,
}: {
  disabled?: boolean;
  name: string;
  label?: string;
  min?: number;
  onChange: InputEventFunction | TextareaEventFunction;
  optional?: boolean;
  pattern?: string;
  step?: number;
  type?: 'text' | 'textarea' | 'number';
  value?: string | number;
}) {
  return (
    <StyledField>
      <label htmlFor={name}>
        <Text as="span" small>
          {label}
        </Text>
        {optional && (
          <Text as="span" small muted>
            {' '}
            (optional)
          </Text>
        )}
      </label>
      {type === 'textarea' ? (
        <TextareaAutosize
          id={name}
          name={name}
          disabled={disabled}
          defaultValue={value}
          onChange={onChange as TextareaEventFunction}
        />
      ) : (
        <TextInput
          id={name}
          name={name}
          type={type}
          disabled={disabled}
          defaultValue={value}
          onChange={onChange as InputEventFunction}
          min={min}
          pattern={pattern}
          step={step}
        />
      )}
    </StyledField>
  );
}

function ToggleField({
  name,
  label = name,
  trueLabel = 'true',
  falseLabel = 'false',
  value,
  optional,
  onChange,
  disabled,
}: {
  name: string;
  label?: string;
  trueLabel?: string;
  falseLabel?: string;
  value: boolean;
  optional?: boolean;
  onChange: EventTargetFunction;
  disabled?: boolean;
}) {
  return (
    <StyledField>
      <label htmlFor={name}>
        <strong>{label}:</strong>
        {optional && <small> (optional)</small>}
      </label>
      {disabled ? (
        value ? (
          trueLabel
        ) : (
          falseLabel
        )
      ) : (
        <SegmentedButton>
          <Button
            small
            disabled={value}
            name={name}
            value="true"
            onPress={onChange}
          >
            {trueLabel}
          </Button>
          <Button
            small
            disabled={!value}
            name={name}
            value="false"
            onPress={onChange}
          >
            {falseLabel}
          </Button>
        </SegmentedButton>
      )}
    </StyledField>
  );
}

export function DefinitionContestsScreen({
  allowEditing,
}: {
  allowEditing: boolean;
}): JSX.Element {
  const { electionDefinition, saveElection } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const { contestId } = useParams<{ contestId: ContestId }>();
  const contestIndex = election.contests.findIndex((c) => c.id === contestId);
  const contest = election.contests[contestIndex];

  async function saveContest(newContest: AnyContest) {
    if (allowEditing) {
      const newElection: Election = {
        ...election,
        contests: [
          ...election.contests.slice(0, contestIndex),
          newContest,
          ...election.contests.slice(contestIndex + 1),
        ],
      };
      await saveElection(JSON.stringify(newElection));
    }
  }

  const saveTextField: InputEventFunction = async (event) => {
    const { name, value: targetValue, type } = event.currentTarget;
    let value: string | number = targetValue;
    if (type === 'number') {
      // eslint-disable-next-line vx/gts-safe-number-parse
      value = parseInt(value, 10);
    }
    if (name === 'seats' && value < 1) {
      value = 1;
    }
    await saveContest({
      ...contest,
      [name]: value,
    });
  };

  const saveToggleField: EventTargetFunction = async (event) => {
    const { name, value } = event.currentTarget as HTMLButtonElement;
    await saveContest({
      ...contest,
      [name]: value === 'true',
    });
  };

  const saveCandidateTextField: InputEventFunction = async (event) => {
    const { name, value: targetValue } = event.currentTarget;
    const nameParts = name.split('.');
    // eslint-disable-next-line vx/gts-safe-number-parse
    const candidateIndex = parseInt(nameParts[0], 10);
    const candidateKey = nameParts[1];
    const candidateContest = contest as CandidateContest;
    const { candidates } = candidateContest;
    const newCandidates = [...candidates];

    switch (candidateKey) {
      case 'id':
        newCandidates[candidateIndex] = {
          ...candidates[candidateIndex],
          id: targetValue,
        };
        break;

      case 'name':
        newCandidates[candidateIndex] = {
          ...candidates[candidateIndex],
          name: targetValue,
        };
        break;

      case 'partyIds':
        newCandidates[candidateIndex] = {
          ...candidates[candidateIndex],
          partyIds: targetValue
            .split(',')
            .map((id) => unsafeParse(PartyIdSchema, id.trim())),
        };
        break;

      default:
        throw new Error(`Unknown candidate key: ${candidateKey}`);
    }

    await saveContest({
      ...candidateContest,
      candidates: newCandidates,
    });
  };

  const saveMsEitherNeitherOptionLabel: InputEventFunction = async (event) => {
    const { name, value } = event.currentTarget;
    const optionName = name as
      | 'eitherOption'
      | 'neitherOption'
      | 'firstOption'
      | 'secondOption';
    const msEitherNeitherContest = contest as MsEitherNeitherContest;
    await saveContest({
      ...msEitherNeitherContest,
      [optionName]: {
        ...msEitherNeitherContest[optionName],
        label: value,
      },
    });
  };

  const appendSvgToDescription: InputEventFunction = async (event) => {
    const { files } = event.currentTarget;
    const file = files?.[0];
    if (file?.type === 'image/svg+xml') {
      const yesNoContest = contest as YesNoContest;
      try {
        const fileContent = await readFileAsync(file);
        const description = `${yesNoContest.description}

${fileContent}`;
        await saveContest({
          ...yesNoContest,
          description,
        });
      } catch (error) {
        console.error('appendSvgToDescription failed', error); // eslint-disable-line no-console
      }
    } else {
      console.error('Only SVG images are supported.'); // eslint-disable-line no-console
    }
  };

  if (contestId && contest) {
    return (
      <NavigationScreen>
        <PageHeader>
          <Prose maxWidth={false}>
            <h1>{allowEditing ? 'Edit' : 'View'} Contest</h1>
            <p>
              {allowEditing
                ? 'Disabled fields are shown for informational purpose and can be edited in the JSON Editor if necessary.'
                : 'Editing currently disabled.'}
            </p>
          </Prose>
        </PageHeader>
        <Columns>
          <RenderedContest>
            <Prose>
              <h3>Sample Render</h3>
            </Prose>
            <Paper isNarrow={contest.type === 'candidate'}>
              <Contest section={contest.section} title={contest.title}>
                {contest.type === 'candidate' && (
                  <React.Fragment>
                    <p>
                      {contest.seats === 1
                        ? 'Vote for 1'
                        : `Vote for not more than ${contest.seats}`}
                    </p>
                    <CandidateContestChoices
                      election={election}
                      contest={contest}
                      vote={[]}
                      locales={{ primary: 'en-US' }}
                    />
                  </React.Fragment>
                )}
                {contest.type === 'yesno' && (
                  <React.Fragment>
                    <p>
                      Vote <strong>Yes</strong> or <strong>No</strong>
                    </p>
                    <Text
                      small
                      preLine
                      dangerouslySetInnerHTML={{
                        __html: DomPurify.sanitize(contest.description),
                      }}
                    />
                    {['Yes', 'No'].map((answer) => (
                      <Text key={answer} bold noWrap>
                        <BubbleMark
                          position={election.ballotLayout?.targetMarkPosition}
                          checked={false}
                        >
                          <span>{answer}</span>
                        </BubbleMark>
                      </Text>
                    ))}
                  </React.Fragment>
                )}
                {contest.type === 'ms-either-neither' && (
                  <React.Fragment>
                    <Text
                      small
                      preLine
                      dangerouslySetInnerHTML={{
                        __html: DomPurify.sanitize(contest.description),
                      }}
                    />
                    <p>{contest.eitherNeitherLabel}</p>
                    <Text key={contest.eitherOption.id} bold>
                      <BubbleMark
                        position={election.ballotLayout?.targetMarkPosition}
                        checked={false}
                      >
                        <span>{contest.eitherOption.label}</span>
                      </BubbleMark>
                    </Text>
                    <Text key={contest.neitherOption.id} bold>
                      <BubbleMark
                        position={election.ballotLayout?.targetMarkPosition}
                        checked={false}
                      >
                        <span>{contest.neitherOption.label}</span>
                      </BubbleMark>
                    </Text>
                    <p>{contest.pickOneLabel}</p>
                    <Text key={contest.firstOption.id} bold>
                      <BubbleMark
                        position={election.ballotLayout?.targetMarkPosition}
                        checked={false}
                      >
                        <span>{contest.firstOption.label}</span>
                      </BubbleMark>
                    </Text>
                    <Text key={contest.secondOption.id} bold>
                      <BubbleMark
                        position={election.ballotLayout?.targetMarkPosition}
                        checked={false}
                      >
                        <span>{contest.secondOption.label}</span>
                      </BubbleMark>
                    </Text>
                  </React.Fragment>
                )}
              </Contest>
            </Paper>
          </RenderedContest>
          <div>
            <Prose>
              <h3>Contest Data</h3>
            </Prose>
            <TextField
              name="type"
              label="Type"
              value={contest.type}
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="id"
              label="Contest ID"
              value={contest.id}
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="districtId"
              label="District ID"
              value={contest.districtId}
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="partyId"
              label="Party ID"
              value={contest.partyId || ''}
              optional
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="section"
              label="Section Name"
              value={contest.section}
              onChange={saveTextField}
              disabled={!allowEditing}
            />
            <TextField
              label="Title"
              name="title"
              value={contest.title}
              onChange={saveTextField}
              disabled={!allowEditing}
            />
            {contest.type === 'yesno' && (
              <TextField
                label="Short Title"
                name="shortTitle"
                value={contest.shortTitle}
                onChange={saveTextField}
                disabled={!allowEditing}
              />
            )}
            {contest.type === 'candidate' && (
              <React.Fragment>
                <TextField
                  name="seats"
                  label="Seats"
                  value={contest.seats}
                  type="number"
                  min={0}
                  step={1}
                  pattern="\d*"
                  onChange={saveTextField}
                  disabled={!allowEditing}
                />
                <ToggleField
                  name="allowWriteIns"
                  label="Allow Write-Ins"
                  value={contest.allowWriteIns}
                  onChange={saveToggleField}
                  disabled={!allowEditing}
                />
                <h2>Candidates</h2>
                <ol>
                  {contest.candidates.map((candidate, index) => (
                    <li key={candidate.id}>
                      <TextField
                        name={`${index}.name`}
                        label="Candidate Name"
                        value={candidate.name}
                        onChange={saveCandidateTextField}
                        disabled={!allowEditing}
                      />
                      <TextField
                        name={`${index}.id`}
                        label="Candidate ID"
                        value={candidate.id}
                        onChange={saveCandidateTextField}
                        disabled
                      />
                      <TextField
                        name={`${index}.partyIds`}
                        label="Party IDs"
                        value={candidate.partyIds?.join(', ') ?? ''}
                        optional
                        onChange={saveCandidateTextField}
                        disabled
                      />
                    </li>
                  ))}
                </ol>
              </React.Fragment>
            )}
            {contest.type === 'yesno' && (
              <React.Fragment>
                <TextField
                  label="Description"
                  name="description"
                  type="textarea"
                  value={contest.description}
                  onChange={saveTextField}
                  disabled={!allowEditing}
                />
                <FileInputButton
                  buttonProps={{
                    small: true,
                  }}
                  accept="image/svg+xml"
                  onChange={appendSvgToDescription}
                  disabled={!allowEditing}
                >
                  Append SVG Image to Description
                </FileInputButton>
              </React.Fragment>
            )}
            {contest.type === 'ms-either-neither' && (
              <React.Fragment>
                <TextField
                  label="Description (Add bold formatting: <b>bold</b>)"
                  name="description"
                  type="textarea"
                  value={contest.description}
                  onChange={saveTextField}
                  disabled={!allowEditing}
                />
                <TextField
                  label="Either Neither Instruction Label"
                  name="eitherNeitherLabel"
                  value={contest.eitherNeitherLabel}
                  onChange={saveTextField}
                  disabled={!allowEditing}
                />
                <TextField
                  label="Either Option Label"
                  name="eitherOption"
                  value={contest.eitherOption.label}
                  onChange={saveMsEitherNeitherOptionLabel}
                  disabled={!allowEditing}
                />
                <TextField
                  label="Neither Option Label"
                  name="neitherOption"
                  value={contest.neitherOption.label}
                  onChange={saveMsEitherNeitherOptionLabel}
                  disabled={!allowEditing}
                />
                <TextField
                  label="Pick One Instruction Label"
                  name="pickOneLabel"
                  value={contest.pickOneLabel}
                  onChange={saveTextField}
                  disabled={!allowEditing}
                />
                <TextField
                  label="First Option Label"
                  name="firstOption"
                  value={contest.firstOption.label}
                  onChange={saveMsEitherNeitherOptionLabel}
                  disabled={!allowEditing}
                />
                <TextField
                  label="First Option Label"
                  name="secondOption"
                  value={contest.secondOption.label}
                  onChange={saveMsEitherNeitherOptionLabel}
                  disabled={!allowEditing}
                />
              </React.Fragment>
            )}
          </div>
        </Columns>
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen>
      <h1>DefinitionContestsScreen</h1>
      <p>
        /definition/contests - Add new - section - title - party - seats -
        allowWriteIns - candidates.length
      </p>
    </NavigationScreen>
  );
}
