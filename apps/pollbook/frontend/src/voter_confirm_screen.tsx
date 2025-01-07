import {
  Button,
  ButtonBar,
  Callout,
  Card,
  CheckboxButton,
  CheckboxGroup,
  Font,
  H1,
  H2,
  LabelledText,
  Main,
  MainContent,
  MainHeader,
  Modal,
  RadioGroup,
  SearchSelect,
} from '@votingworks/ui';
import { Column, Row } from './layout';
import { useState } from 'react';
import { NoNavScreen } from './nav_screen';
import type { Voter } from '@votingworks/pollbook-backend';

export function VoterConfirmScreen({
  voter,
  onCancel,
  onConfirm,
}: {
  voter: Voter;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const [identificationMethod, setIdentificationMethod] =
    useState<string>('ID');

  return (
    <NoNavScreen>
      <MainHeader>
        <H1>Check In Voter</H1>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'column' }}>
        <Row style={{ gap: '1rem', flexGrow: 1 }}>
          <Column style={{ gap: '0.5rem', flex: 1 }}>
            <RadioGroup
              label="Identification Method"
              options={[
                {
                  label: 'Valid Photo ID',
                  value: 'ID',
                },
                {
                  label: 'Challenged Voter Affidavit (CVA)',
                  value: 'CVA',
                },
                {
                  label: (
                    <span>
                      Out-of-State Driver's License (OOS DL)
                      <SearchSelect
                        style={{ marginLeft: '1rem' }}
                        options={[
                          {
                            label: 'CA',
                            value: 'CA',
                          },
                        ]}
                        placeholder="Select state"
                        onChange={() => {}}
                      />
                    </span>
                  ),
                  value: 'OOS DL',
                },
                {
                  label: (
                    <span>
                      Personal Recognizance
                      <SearchSelect
                        style={{ marginLeft: '1rem' }}
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
                        placeholder="Select recognizer"
                        onChange={() => {}}
                      />
                    </span>
                  ),
                  value: 'PR',
                },
              ]}
              value={identificationMethod}
              onChange={(value) => setIdentificationMethod(value)}
            />
            {/* <CheckboxButton
              label="Challenged Voter Affidavit (CVA)"
              isChecked={false}
              onChange={() => {}}
            />
            <CheckboxButton
              label="Out-of-State Driver's License (OOS DL)"
              isChecked={false}
              onChange={() => {}}
            />
            <CheckboxButton
              label="Personal Recognizance"
              isChecked={false}
              onChange={() => {}}
            /> */}
          </Column>
          <Column style={{ gap: '0.5rem', flex: 1 }}>
            <Callout icon="Danger" color="warning">
              Read the voter's information aloud to confirm their identity.
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
                <LabelledText label="Voter ID">{voter.voterID}</LabelledText>
              </Column>
            </Card>
          </Column>
        </Row>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          onPress={onConfirm}
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
