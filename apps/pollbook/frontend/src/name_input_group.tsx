import {
  VoterNameChangeRequest,
  VOTER_INPUT_FIELD_LIMITS,
} from '@votingworks/types';
import { Row, FieldName } from './layout';
import {
  RequiredExpandableInput,
  TextField,
  ExpandableInput,
  StaticInput,
} from './shared_components';

export function NameInputGroup({
  name,
  onChange,
}: {
  name: VoterNameChangeRequest;
  onChange: (name: VoterNameChangeRequest) => void;
}): JSX.Element {
  return (
    <Row style={{ gap: '1rem' }}>
      <RequiredExpandableInput>
        <FieldName>Last Name</FieldName>
        <TextField
          aria-label="Last Name"
          value={name.lastName}
          onChange={(e) => {
            const value = e.target.value
              .toLocaleUpperCase()
              .slice(0, VOTER_INPUT_FIELD_LIMITS.lastName);
            onChange({
              ...name,
              lastName: value,
            });
          }}
        />
      </RequiredExpandableInput>
      <RequiredExpandableInput>
        <FieldName>First Name</FieldName>
        <TextField
          aria-label="First Name"
          value={name.firstName}
          onChange={(e) => {
            const value = e.target.value
              .toLocaleUpperCase()
              .slice(0, VOTER_INPUT_FIELD_LIMITS.firstName);
            onChange({
              ...name,
              firstName: value,
            });
          }}
        />
      </RequiredExpandableInput>
      <ExpandableInput>
        <FieldName>Middle Name</FieldName>
        <TextField
          aria-label="Middle Name"
          value={name.middleName}
          onChange={(e) => {
            const value = e.target.value
              .toLocaleUpperCase()
              .slice(0, VOTER_INPUT_FIELD_LIMITS.middleName);
            onChange({
              ...name,
              middleName: value,
            });
          }}
        />
      </ExpandableInput>
      <StaticInput>
        <FieldName>Suffix</FieldName>
        <TextField
          aria-label="Suffix"
          value={name.suffix}
          style={{ width: '5rem' }}
          onChange={(e) => {
            const value = e.target.value
              .toLocaleUpperCase()
              .slice(0, VOTER_INPUT_FIELD_LIMITS.nameSuffix);
            onChange({
              ...name,
              suffix: value,
            });
          }}
        />
      </StaticInput>
    </Row>
  );
}
