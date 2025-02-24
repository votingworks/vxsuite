import {
  Button,
  ButtonBar,
  Callout,
  Caption,
  Card,
  CheckboxButton,
  H1,
  H2,
  LabelledText,
  MainContent,
  MainHeader,
  RadioOption,
  SearchSelect,
} from '@votingworks/ui';
import { useState } from 'react';
import type { VoterIdentificationMethod } from '@votingworks/pollbook-backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Column, FieldName, Row } from './layout';
import { NoNavScreen } from './nav_screen';
import { usStates } from './us_states';
import {
  AbsenteeModeCallout,
  AddressChange,
  PartyName,
  VoterAddress,
  VoterName,
} from './shared_components';
import { UpdateAddressFlow } from './update_address_flow';
import { getVoter } from './api';
import { UpdateNameFlow } from './update_name_flow';

function isIdentificationMethodComplete(
  identificationMethod: Partial<VoterIdentificationMethod>
): identificationMethod is VoterIdentificationMethod {
  switch (identificationMethod.type) {
    case 'default':
      return true;
    case 'outOfStateLicense':
      return Boolean(identificationMethod.state);
    case undefined:
      return false;
    default:
      throwIllegalValue(identificationMethod);
  }
}

export function VoterConfirmScreen({
  voterId,
  isAbsenteeMode,
  onCancel,
  onConfirm,
}: {
  voterId: string;
  isAbsenteeMode: boolean;
  onCancel: () => void;
  onConfirm: (identificationMethod: VoterIdentificationMethod) => void;
}): JSX.Element | null {
  const getVoterQuery = getVoter.useQuery(voterId);
  const [showUpdateAddressFlow, setShowUpdateAddressFlow] = useState(false);
  const [showUpdateNameFlow, setShowUpdateNameFlow] = useState(false);
  const [identificationMethod, setIdentificationMethod] = useState<
    Partial<VoterIdentificationMethod>
  >({ type: 'default' });

  if (!getVoterQuery.isSuccess) {
    return null;
  }

  const voter = getVoterQuery.data;

  if (showUpdateAddressFlow) {
    return (
      <UpdateAddressFlow
        voter={voter}
        returnToCheckIn={() => setShowUpdateAddressFlow(false)}
        exitToSearch={onCancel}
      />
    );
  }

  if (showUpdateNameFlow) {
    return (
      <UpdateNameFlow
        voter={voter}
        returnToCheckIn={() => setShowUpdateNameFlow(false)}
        exitToSearch={onCancel}
      />
    );
  }

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Confirm Voter Identity</H1>
          {isAbsenteeMode && <AbsenteeModeCallout />}
        </Row>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'column' }}>
        <Column style={{ gap: '0.5rem', flex: 1 }}>
          {!isAbsenteeMode && (
            <Callout icon="Danger" color="warning">
              Read the voter&apos;s information aloud to confirm their identity.
            </Callout>
          )}
          <Card color="neutral">
            {voter.nameChange && (
              <div>
                <Caption>
                  <s>Name</s>
                </Caption>
                <H2 style={{ marginTop: 0 }}>
                  <s>
                    <VoterName voter={{ ...voter, nameChange: undefined }} />
                  </s>
                </H2>
              </div>
            )}
            {voter.nameChange && <Caption>Updated Name</Caption>}
            <H2 style={{ marginTop: 0 }}>
              <VoterName voter={voter} />
            </H2>
            <Column style={{ gap: '1rem' }}>
              <LabelledText label="Party">
                <PartyName party={voter.party} />
              </LabelledText>
              <Row style={{ gap: '1.5rem' }}>
                <LabelledText
                  label={voter.addressChange ? <s>Address</s> : 'Address'}
                >
                  <VoterAddress
                    voter={voter}
                    style={
                      voter.addressChange && {
                        textDecoration: 'line-through',
                      }
                    }
                  />
                </LabelledText>
                {voter.addressChange && (
                  <LabelledText label="Updated Address">
                    <AddressChange address={voter.addressChange} />
                  </LabelledText>
                )}
              </Row>
              <LabelledText label="Voter ID">{voter.voterId}</LabelledText>
            </Column>
          </Card>
          <Row style={{ justifyContent: 'space-between' }}>
            {isAbsenteeMode ? (
              <div />
            ) : (
              <Row style={{ gap: '0.5rem' }}>
                <CheckboxButton
                  label="Out-of-State ID"
                  onChange={(checked) => {
                    setIdentificationMethod(
                      checked
                        ? { type: 'outOfStateLicense' }
                        : { type: 'default' }
                    );
                  }}
                  isChecked={identificationMethod.type === 'outOfStateLicense'}
                />

                {identificationMethod.type === 'outOfStateLicense' && (
                  <SearchSelect
                    id="state"
                    options={Object.entries(usStates).map(([value, label]) => ({
                      value,
                      label: `${value} - ${label}`,
                    }))}
                    value={
                      identificationMethod.type === 'outOfStateLicense'
                        ? identificationMethod.state
                        : undefined
                    }
                    onChange={(state) =>
                      setIdentificationMethod({
                        type: 'outOfStateLicense',
                        state,
                      })
                    }
                    style={{ width: '14rem' }}
                    placeholder="Select state..."
                    ariaLabel="Select state"
                  />
                )}
              </Row>
            )}
            <Row style={{ gap: '0.5rem' }}>
              <Button icon="Edit" onPress={() => setShowUpdateNameFlow(true)}>
                Update Name
              </Button>
              <Button
                icon="Edit"
                onPress={() => setShowUpdateAddressFlow(true)}
              >
                Update Address
              </Button>
            </Row>
          </Row>
        </Column>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          disabled={!isIdentificationMethodComplete(identificationMethod)}
          onPress={() => {
            assert(isIdentificationMethodComplete(identificationMethod));
            onConfirm(identificationMethod);
          }}
          style={{ flex: 1 }}
        >
          Confirm Check-In
        </Button>
        <Button onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}
