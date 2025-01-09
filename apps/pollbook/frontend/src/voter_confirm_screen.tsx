import {
  Button,
  ButtonBar,
  Callout,
  Card,
  Font,
  H1,
  H2,
  LabelledText,
  MainContent,
  MainHeader,
  RadioOption,
  SearchSelect,
} from '@votingworks/ui';
import { useState } from 'react';
import type {
  Voter,
  VoterIdentificationMethod,
} from '@votingworks/pollbook-backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Column, FieldName, Row } from './layout';
import { NoNavScreen } from './nav_screen';
import { usStates } from './us_states';

function isIdentificationMethodComplete(
  identificationMethod: Partial<VoterIdentificationMethod>
): identificationMethod is VoterIdentificationMethod {
  switch (identificationMethod.type) {
    case 'photoId':
      return Boolean(identificationMethod.state);
    case 'challengedVoterAffidavit':
      return true;
    case 'personalRecognizance':
      return Boolean(identificationMethod.recognizer);
    case undefined:
      return false;
    default:
      throwIllegalValue(identificationMethod);
  }
}

export function VoterConfirmScreen({
  voter,
  onCancel,
  onConfirm,
}: {
  voter: Voter;
  onCancel: () => void;
  onConfirm: (identificationMethod: VoterIdentificationMethod) => void;
}): JSX.Element {
  const [identificationMethod, setIdentificationMethod] = useState<
    Partial<VoterIdentificationMethod>
  >({ type: 'photoId', state: 'NH' });

  return (
    <NoNavScreen>
      <MainHeader>
        <H1>Check In Voter</H1>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'column' }}>
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
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
              <RadioOption
                label="Photo ID"
                value="photoId"
                isSelected={identificationMethod.type === 'photoId'}
                onChange={(value) =>
                  setIdentificationMethod({ type: value, state: 'NH' })
                }
              />
              {identificationMethod.type === 'photoId' && (
                <Row style={{ gap: '0.5rem', alignItems: 'center' }}>
                  <label htmlFor="state">Select state:</label>
                  <SearchSelect
                    id="state"
                    style={{ flex: 1 }}
                    options={Object.entries(usStates).map(([value, label]) => ({
                      value,
                      label: `${value} - ${label}`,
                    }))}
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
                  />
                </Row>
              )}
              <RadioOption
                label="Challenged Voter Affidavit (CVA)"
                value="challengedVoterAffidavit"
                isSelected={
                  identificationMethod.type === 'challengedVoterAffidavit'
                }
                onChange={(value) => setIdentificationMethod({ type: value })}
              />
              <RadioOption
                label="Personal Recognizance"
                value="personalRecognizance"
                isSelected={
                  identificationMethod.type === 'personalRecognizance'
                }
                onChange={(value) => setIdentificationMethod({ type: value })}
              />
              {identificationMethod.type === 'personalRecognizance' && (
                <Row style={{ gap: '0.5rem', alignItems: 'center' }}>
                  <label htmlFor="recognizer">Select recognizer:</label>
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
                        ? identificationMethod.recognizer
                        : undefined
                    }
                    onChange={(value) => {
                      setIdentificationMethod({
                        type: 'personalRecognizance',
                        recognizer: value,
                      });
                    }}
                  />
                </Row>
              )}
            </fieldset>
          </Column>
          <Column style={{ gap: '0.5rem', flex: 1 }}>
            <Callout icon="Danger" color="warning">
              Read the voter&apos;s information aloud to confirm their identity.
            </Callout>
            <Card color="primary">
              <H2>
                {voter.firstName} {voter.lastName}
              </H2>
              <Column style={{ gap: '1rem' }}>
                <LabelledText label="Party">{voter.party}</LabelledText>
                <LabelledText label="Address">
                  <div>
                    {voter.streetNumber} {voter.streetName}
                    <br />
                    <Font noWrap>
                      {voter.postalCityTown}, {voter.state}, {voter.postalZip5}-
                      {voter.zip4}
                    </Font>
                  </div>
                </LabelledText>
                <LabelledText label="Voter ID">{voter.voterId}</LabelledText>
              </Column>
            </Card>
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
