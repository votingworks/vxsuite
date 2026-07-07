import React, { useState } from 'react';
import styled from 'styled-components';

import { format, getLanguageOptions } from '@votingworks/utils';
import {
  BallotType,
  hasSplits,
  Id,
  isCombinedBallotPrimary,
  LanguageCode,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
} from '@votingworks/types';
import {
  RadioGroup,
  SegmentedButton,
  NumberInput,
  Modal,
  Loading,
} from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import {
  Column,
  Container,
  ExpandedSelect,
  Footer,
  Form,
  PrecinctSelect,
  PrintAllButton,
  PrintButton,
  ScreenWrapper,
  TitleBar,
} from '../components';
import {
  getDeviceStatuses,
  getElectionRecord,
  getPollingPlaceId,
  printBallot,
} from '../api';
import { getPartyOptions } from '../utils';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: hidden;

  > fieldset {
    /* Ensure RadioGroups can scroll if they overflow */
    overflow-y: auto;

    /* Extra padding to prevent clipping of focus outline.
     * The gap is slightly reduced on FormSection's with RadioGroups
     * to compensate.
     */
    padding: 0.25rem;
  }

  > strong {
    padding-left: 0.25rem;
  }
`;

const FooterSection = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

export function PrintScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth?: boolean;
}): JSX.Element | null {
  const [numCopies, setNumCopies] = useState(1);
  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedPrecinctId, setSelectedPrecinctId] = useState<Id>('');
  const [selectedSplitId, setSelectedSplitId] = useState<Id>('');
  const [selectedPartyId, setSelectedPartyId] = useState<Id>('');
  const [selectedLanguageCode, setSelectedLanguageCode] = useState(
    LanguageCode.ENGLISH
  );
  const [isAbsentee, setIsAbsentee] = useState<boolean>(false);
  const printBallotMutation = printBallot.useMutation();

  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();
  const pollingPlaceId = pollingPlaceIdQuery.data;

  const [isShowingPrintingModal, setIsShowingPrintingModal] = useState(false);

  const precincts = React.useMemo(() => {
    if (!getElectionRecordQuery.data) return [];

    const { election } = getElectionRecordQuery.data.electionDefinition;

    // Election managers can print ballots for any precinct, so don't filter
    // down to the configured polling place's precincts.
    if (isElectionManagerAuth || !pollingPlaceId) return election.precincts;

    const place = pollingPlaceFromElection(election, pollingPlaceId);
    const precinctIds = pollingPlacePrecinctIds(place);

    return election.precincts.filter((p) => precinctIds.has(p.id));
  }, [getElectionRecordQuery.data, pollingPlaceId, isElectionManagerAuth]);

  if (!selectedPrecinctId && precincts.length > 0) {
    const defaultSelection = precincts[0].id;
    setSelectedPrecinctId(defaultSelection);
  }

  if (
    !getElectionRecordQuery.isSuccess ||
    !pollingPlaceIdQuery.isSuccess ||
    !getDeviceStatusesQuery.isSuccess
  ) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);
  const languages = getLanguageOptions(election);
  const hideLanguageSelection = languages.length === 1;

  const parties = getPartyOptions(election);
  const { printer } = getDeviceStatusesQuery.data;
  const hidePartySelection =
    election.type !== 'primary' || isCombinedBallotPrimary(election);

  // If VxPrint is configured for a single precinct, hide the precinct
  // selection for Poll Workers and default to the configured precinct
  const hidePrecinctSelection =
    precincts.length === 1 && !isElectionManagerAuth;
  const selectedPrecinct = selectedPrecinctId
    ? precincts.find((p) => p.id === selectedPrecinctId)
    : undefined;

  const availableSplits =
    selectedPrecinct && hasSplits(selectedPrecinct)
      ? selectedPrecinct.splits
      : [];
  const hideSplitSelection = availableSplits.length === 0;

  function handlePrint() {
    setIsShowingPrintingModal(true);
    setTimeout(() => {
      setIsShowingPrintingModal(false);
    }, DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
    printBallotMutation.mutate({
      precinctId: assertDefined(selectedPrecinct).id,
      splitId: selectedSplitId,
      partyId: selectedPartyId,
      languageCode: selectedLanguageCode,
      ballotType: isAbsentee ? BallotType.Absentee : BallotType.Precinct,
      copies: numCopies,
    });
  }

  return (
    <ScreenWrapper
      authType={isElectionManagerAuth ? 'election_manager' : 'poll_worker'}
    >
      <Container>
        <TitleBar
          title="Print"
          actions={
            isElectionManagerAuth ? (
              <PrintAllButton disabled={!printer.connected} />
            ) : undefined
          }
        />
        <Form>
          <Column>
            <FormSection
              style={{
                // Grow to fill space when precinct selection is enabled
                flex: hidePrecinctSelection ? undefined : 1,
                // Provide buffer for alignment when precinct selection is hidden
                marginBottom: hidePrecinctSelection ? '2.75rem' : undefined,
              }}
            >
              <PrecinctSelect
                searchValue={searchValue}
                selectedPrecinctId={selectedPrecinctId}
                precincts={precincts}
                onSearch={setSearchValue}
                onSelect={(value) => {
                  if (value !== selectedPrecinctId) {
                    setSelectedPrecinctId(value);
                    setSelectedSplitId('');
                  }
                }}
              />
            </FormSection>
            {hideSplitSelection ? null : (
              <FormSection>
                <strong style={{ marginBottom: '0.25rem' }}>Split</strong>
                <ExpandedSelect
                  selectedValue={selectedSplitId}
                  options={availableSplits.map((split) => ({
                    value: split.id,
                    label: split.name,
                  }))}
                  onSelect={setSelectedSplitId}
                />
              </FormSection>
            )}
          </Column>
          <Column>
            {hidePartySelection ? null : (
              <FormSection style={{ gap: '0.25rem' }}>
                <strong>Party</strong>
                <RadioGroup
                  label="Party"
                  value={selectedPartyId}
                  options={parties.map((party) => ({
                    label: party.name,
                    value: party.id,
                  }))}
                  onChange={setSelectedPartyId}
                  hideLabel
                />
              </FormSection>
            )}
            {hideLanguageSelection ? null : (
              <FormSection style={{ gap: '0.25rem' }}>
                <strong>Language</strong>
                <RadioGroup
                  label="Language"
                  value={selectedLanguageCode}
                  options={languages.map((language) => ({
                    label: format.languageDisplayName({
                      languageCode: language,
                      displayLanguageCode: 'en',
                    }),
                    value: language,
                  }))}
                  onChange={setSelectedLanguageCode}
                  hideLabel
                />
              </FormSection>
            )}
          </Column>
        </Form>
        <Footer>
          {isElectionManagerAuth && (
            <FooterSection style={{ marginRight: 'auto' }}>
              <strong>Ballot Type:</strong>
              <SegmentedButton
                label="Precinct or Absentee"
                selectedOptionId={isAbsentee ? 'absentee' : 'precinct'}
                options={[
                  { label: 'Precinct', id: 'precinct' },
                  { label: 'Absentee', id: 'absentee' },
                ]}
                onChange={(newValue) => {
                  setIsAbsentee(newValue === 'absentee');
                }}
                hideLabel
              />
            </FooterSection>
          )}
          <FooterSection>
            <strong>Copies:</strong>
            <NumberInput
              value={numCopies}
              onChange={(value) => setNumCopies(value || 0)}
              style={{ width: '4rem' }}
            />
          </FooterSection>
          <PrintButton
            icon="Print"
            color="primary"
            fill="filled"
            onPress={handlePrint}
            disabled={
              !selectedPrecinct ||
              !selectedLanguageCode ||
              (!hidePartySelection && !selectedPartyId) ||
              (!hideSplitSelection && !selectedSplitId) ||
              !printer.connected
            }
          >
            Print Ballot
          </PrintButton>
        </Footer>
        {isShowingPrintingModal && (
          <Modal
            centerContent
            content={
              <Loading
                animationDurationS={DEFAULT_PROGRESS_MODAL_DELAY_SECONDS}
              >
                Printing
              </Loading>
            }
          />
        )}
      </Container>
    </ScreenWrapper>
  );
}
