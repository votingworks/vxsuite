import { assert } from '@votingworks/basics';
import React, { useContext } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ContestId } from '@votingworks/types';

import {
  Button,
  SegmentedButtonDeprecated as SegmentedButton,
  Prose,
  Text,
} from '@votingworks/ui';
import { noop } from 'lodash';
import { InputEventFunction, TextareaEventFunction } from '../config/types';

import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import { TextInput } from '../components/text_input';
import { TextareaAutosize } from '../components/textarea';

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
  onChange: (field: { name: string; value: boolean }) => void;
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
            value={{ name, value: true }}
            onPress={onChange}
          >
            {trueLabel}
          </Button>
          <Button
            small
            disabled={!value}
            value={{ name, value: false }}
            onPress={onChange}
          >
            {falseLabel}
          </Button>
        </SegmentedButton>
      )}
    </StyledField>
  );
}

export function DefinitionContestsScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const { contestId } = useParams<{ contestId: ContestId }>();
  const contestIndex = election.contests.findIndex((c) => c.id === contestId);
  const contest = election.contests[contestIndex];

  if (contestId && contest) {
    return (
      <NavigationScreen>
        <PageHeader>
          <Prose maxWidth={false}>
            <h1>View Contest</h1>
          </Prose>
        </PageHeader>
        <Columns>
          <div>
            <Prose>
              <h3>Contest Data</h3>
            </Prose>
            <TextField
              name="type"
              label="Type"
              value={contest.type}
              onChange={noop}
              disabled
            />
            <TextField
              name="id"
              label="Contest ID"
              value={contest.id}
              onChange={noop}
              disabled
            />
            <TextField
              name="districtId"
              label="District ID"
              value={contest.districtId}
              onChange={noop}
              disabled
            />
            {contest.type === 'candidate' && (
              <TextField
                name="partyId"
                label="Party ID"
                value={contest.partyId || ''}
                optional
                onChange={noop}
                disabled
              />
            )}
            <TextField
              label="Title"
              name="title"
              value={contest.title}
              onChange={noop}
              disabled
            />
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
                  onChange={noop}
                  disabled
                />
                <ToggleField
                  name="allowWriteIns"
                  label="Allow Write-Ins"
                  value={contest.allowWriteIns}
                  onChange={noop}
                  disabled
                />
                <h2>Candidates</h2>
                <ol>
                  {contest.candidates.map((candidate, index) => (
                    <li key={candidate.id}>
                      <TextField
                        name={`${index}.name`}
                        label="Candidate Name"
                        value={candidate.name}
                        onChange={noop}
                        disabled
                      />
                      <TextField
                        name={`${index}.id`}
                        label="Candidate ID"
                        value={candidate.id}
                        onChange={noop}
                        disabled
                      />
                      <TextField
                        name={`${index}.partyIds`}
                        label="Party IDs"
                        value={candidate.partyIds?.join(', ') ?? ''}
                        optional
                        onChange={noop}
                        disabled
                      />
                    </li>
                  ))}
                </ol>
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
