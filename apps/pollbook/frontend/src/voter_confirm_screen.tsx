import {
  Button,
  ButtonBar,
  Callout,
  Card,
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

function isIdentificationMethodComplete(
  identificationMethod: Partial<VoterIdentificationMethod>
): identificationMethod is VoterIdentificationMethod {
  switch (identificationMethod.type) {
    case 'photoId':
      return Boolean(identificationMethod.state);
    case 'personalRecognizance':
      return (
        Boolean(identificationMethod.recognizerType) &&
        identificationMethod.recognizerInitials?.length === 2
      );
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
  const [identificationMethod, setIdentificationMethod] = useState<
    Partial<VoterIdentificationMethod>
  >({ type: 'photoId', state: 'NH' });

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

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Confirm Voter Identity</H1>
          {isAbsenteeMode && <AbsenteeModeCallout />}
        </Row>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'column' }}>
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
          {!isAbsenteeMode && (
            <Column style={{ flex: 1 }}>
              <FieldName>Identification Method</FieldName>
              <fieldset
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
                role="radiogroup"
              >
                <Card color="neutral">
                  <Column style={{ gap: '0.5rem' }}>
                    <RadioOption
                      label="Photo ID"
                      value="photoId"
                      isSelected={identificationMethod.type === 'photoId'}
                      onChange={(value) =>
                        setIdentificationMethod({ type: value, state: 'NH' })
                      }
                    />
                    <Row style={{ gap: '0.5rem', alignItems: 'center' }}>
                      <label htmlFor="state">ID State:</label>
                      <SearchSelect
                        id="state"
                        style={{ flex: 1 }}
                        options={Object.entries(usStates).map(
                          ([value, label]) => ({
                            value,
                            label: `${value} - ${label}`,
                          })
                        )}
                        value={
                          identificationMethod.type === 'photoId'
                            ? identificationMethod.state
                            : undefined
                        }
                        onChange={(state) =>
                          setIdentificationMethod({
                            type: 'photoId',
                            state,
                          })
                        }
                        disabled={identificationMethod.type !== 'photoId'}
                      />
                    </Row>
                  </Column>
                </Card>
                <Card color="neutral">
                  <Column style={{ gap: '0.5rem' }}>
                    <RadioOption
                      label="Personal Recognizance"
                      value="personalRecognizance"
                      isSelected={
                        identificationMethod.type === 'personalRecognizance'
                      }
                      onChange={(value) =>
                        setIdentificationMethod({ type: value })
                      }
                    />
                    <Row style={{ gap: '0.5rem', alignItems: 'center' }}>
                      <label htmlFor="recognizer">Recognizer:</label>
                      <SearchSelect
                        id="recognizer"
                        style={{ flex: 1 }}
                        options={[
                          {
                            label: 'Supervisor',
                            value: 'supervisor',
                          },
                          {
                            label: 'Moderator',
                            value: 'moderator',
                          },
                          { label: 'City Clerk', value: 'cityClerk' },
                        ]}
                        value={
                          identificationMethod.type === 'personalRecognizance'
                            ? identificationMethod.recognizerType
                            : undefined
                        }
                        onChange={(value) => {
                          setIdentificationMethod({
                            ...identificationMethod,
                            recognizerType: value,
                          });
                        }}
                        disabled={
                          identificationMethod.type !== 'personalRecognizance'
                        }
                      />
                      <label htmlFor="initals">Recognizer Initials:</label>
                      <input
                        id="initials"
                        type="text"
                        value={
                          identificationMethod.type === 'personalRecognizance'
                            ? identificationMethod.recognizerInitials
                            : undefined
                        }
                        onChange={(event) => {
                          setIdentificationMethod({
                            ...identificationMethod,
                            recognizerInitials:
                              event.target.value.toLocaleUpperCase(),
                          });
                        }}
                        disabled={
                          identificationMethod.type !== 'personalRecognizance'
                        }
                        style={{ width: '3rem' }}
                        minLength={2}
                        maxLength={2}
                      />
                    </Row>
                  </Column>
                </Card>
              </fieldset>
            </Column>
          )}
          <Column style={{ gap: '0.5rem', flex: 1 }}>
            {!isAbsenteeMode && (
              <Callout icon="Danger" color="warning">
                Read the voter&apos;s information aloud to confirm their
                identity.
              </Callout>
            )}
            <Card color="neutral">
              <H2>
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
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button
                icon="Edit"
                onPress={() => setShowUpdateAddressFlow(true)}
              >
                Update Address
              </Button>
            </Row>
          </Column>
        </Row>
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
