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
          aria-label="Last Name"
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
          aria-label="First Name"
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
          aria-label="Middle Name"
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
          aria-label="Suffix"
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
