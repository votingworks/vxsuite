import React, { useState } from 'react';
import styled from 'styled-components';

import {
  BooleanEnvironmentVariableName as Feature,
  format,
  getLanguageOptions,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  BallotType,
  hasSplits,
  Id,
  LanguageCode,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
} from '@votingworks/types';
import {
  Button,
  RadioGroup,
  SegmentedButton,
  NumberInput,
  Modal,
  Loading,
} from '@votingworks/ui';
import { assertDefined, find } from '@votingworks/basics';
import { ExpandedSelect } from '../components/expanded_select';
import { TitleBar } from '../components/title_bar';
import { PrintAllButton } from '../components/print_all_button';
import {
  getDeviceStatuses,
  getElectionRecord,
  getPollingPlaceId,
  getPrecinctSelection,
  printBallot,
} from '../api';
import { getPartyOptions } from '../utils';
import { ScreenWrapper } from '../components/screen_wrapper';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

const Container = styled.div`
  /* Adjusted for Toolbar height */
  height: calc(100vh - 2.2rem);
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding-bottom: 0;
`;

const Form = styled.div`
  /* Adjusted for Toolbar, TitleBar, and Footer heights */
  height: calc(100% - 4rem - 2rem - 4rem);
  flex: 1;
  overflow-y: hidden;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  padding: 1rem 0.75rem 1rem 1rem;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: hidden;
`;

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

const Footer = styled.div`
  position: sticky;
  bottom: 0;
  height: 4rem;
  padding: 0.5rem 1rem;
  flex-shrink: 0;
  background-color: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 1rem;
`;

const FooterSection = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const PrintButton = styled(Button)`
  width: 14rem;
  height: 3rem;
  font-size: 1.1rem;
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
  const getConfiguredPrecinctQuery = getPrecinctSelection.useQuery();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const configuredPrecinct = getConfiguredPrecinctQuery.data;
  const pollingPlaceId = getPollingPlaceId.useQuery().data;

  const [isShowingPrintingModal, setIsShowingPrintingModal] = useState(false);

  const precincts = React.useMemo(() => {
    if (!getElectionRecordQuery.data) return [];

    const { election } = getElectionRecordQuery.data.electionDefinition;

    if (!isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)) {
      if (configuredPrecinct?.kind === 'SinglePrecinct') {
        const { precinctId } = configuredPrecinct;
        return [find(election.precincts, (p) => p.id === precinctId)];
      }

      return election.precincts;
    }

    if (!pollingPlaceId) return election.precincts;

    const place = pollingPlaceFromElection(election, pollingPlaceId);
    const precinctIds = pollingPlacePrecinctIds(place);

    return election.precincts.filter((p) => precinctIds.has(p.id));
  }, [configuredPrecinct, getElectionRecordQuery.data, pollingPlaceId]);

  if (!selectedPrecinctId && precincts.length > 0) {
    const defaultSelection = precincts[0].id;
    setSelectedPrecinctId(defaultSelection);
  }

  if (
    !getElectionRecordQuery.isSuccess ||
    !getConfiguredPrecinctQuery.isSuccess ||
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
  const hidePartySelection = election.type !== 'primary';

  // If VxPrint is configured for a single precinct, hide the precinct
  // selection for Poll Workers and default to the configured precinct
  const hidePrecinctSelection =
    configuredPrecinct?.kind === 'SinglePrecinct' && !isElectionManagerAuth;
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
              <strong>Precinct</strong>
              <ExpandedSelect
                selectedValue={selectedPrecinctId}
                options={precincts
                  .filter(
                    (p) =>
                      !searchValue ||
                      p.name.toLowerCase().includes(searchValue.toLowerCase())
                  )
                  .map((p) => ({ value: p.id, label: p.name }))}
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
