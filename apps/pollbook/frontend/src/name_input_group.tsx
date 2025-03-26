import type { VoterNameChangeRequest } from '@votingworks/pollbook-backend';
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
          value={name.lastName}
          onChange={(e) =>
            onChange({
              ...name,
              lastName: e.target.value.toLocaleUpperCase(),
            })
          }
        />
      </RequiredExpandableInput>
      <RequiredExpandableInput>
        <FieldName>First Name</FieldName>
        <TextField
          value={name.firstName}
          onChange={(e) =>
            onChange({
              ...name,
              firstName: e.target.value.toLocaleUpperCase(),
            })
          }
        />
      </RequiredExpandableInput>
      <ExpandableInput>
        <FieldName>Middle Name</FieldName>
        <TextField
          value={name.middleName}
          onChange={(e) =>
            onChange({
              ...name,
              middleName: e.target.value.toLocaleUpperCase(),
            })
          }
        />
      </ExpandableInput>
      <StaticInput>
        <FieldName>Suffix</FieldName>
        <TextField
          value={name.suffix}
          style={{ width: '5rem' }}
          onChange={(e) =>
            onChange({
              ...name,
              suffix: e.target.value.toLocaleUpperCase(),
            })
          }
        />
      </StaticInput>
    </Row>
  );
}
