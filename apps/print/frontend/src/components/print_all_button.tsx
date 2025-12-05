import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  Loading,
  Modal,
  NumberInput,
  RadioGroup,
  SegmentedButton,
} from '@votingworks/ui';
import { BallotType, LanguageCode } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import {
  getDistinctBallotStylesCount,
  getElectionRecord,
  printAllBallotStyles,
} from '../api';
import { getLanguageOptions } from '../utils';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;
const DEFAULT_LANGUAGE = LanguageCode.ENGLISH;

const StyledButton = styled(Button)`
  width: 12rem;
`;

const Section = styled.div`
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.div`
  font-weight: bold;
`;

const Input = styled.div`
  flex: 1;
`;

function PrintAllModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const printAllMutation = printAllBallotStyles.useMutation();
  const [isAbsentee, setIsAbsentee] = useState(false);
  const ballotType = isAbsentee ? BallotType.Absentee : BallotType.Precinct;
  const [numCopies, setNumCopies] = useState(1);
  const [languageCode, setLanguageCode] =
    useState<LanguageCode>(DEFAULT_LANGUAGE);
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getDistinctBallotStylesCountQuery =
    getDistinctBallotStylesCount.useQuery({ ballotType, languageCode });
  const [isShowingPrintingModal, setIsShowingPrintingModal] = useState(false);

  // Default to valid language selection in case the election doesn't support English
  useEffect(() => {
    if (getElectionRecordQuery.data) {
      const languages = getLanguageOptions(
        getElectionRecordQuery.data.electionDefinition.election
      );
      if (!languages.includes(DEFAULT_LANGUAGE)) {
        setLanguageCode(languages[0]);
      }
    }
  }, [getElectionRecordQuery.data]);

  if (
    !getElectionRecordQuery.isSuccess ||
    !getDistinctBallotStylesCountQuery.isSuccess
  ) {
    return null;
  }
  const { election } = assertDefined(
    getElectionRecordQuery.data
  ).electionDefinition;
  const languages = getLanguageOptions(election);
  const hideLanguageSelection = languages.length === 1;
  const numberOfBallotStyles = getDistinctBallotStylesCountQuery.data;

  function handlePrint() {
    setIsShowingPrintingModal(true);
    setTimeout(() => {
      onClose();
    }, DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
    printAllMutation.mutate({
      ballotType,
      copiesPerStyle: numCopies,
      languageCode,
    });
  }

  if (isShowingPrintingModal) {
    return <Modal centerContent content={<Loading>Printing</Loading>} />;
  }

  return (
    <Modal
      title="Print All Ballot Styles"
      content={
        <React.Fragment>
          {hideLanguageSelection ? null : (
            <Section>
              <Label>Language</Label>
              <Input>
                <RadioGroup
                  label="Language"
                  value={languageCode}
                  options={languages.map((language) => ({
                    label: format.languageDisplayName({
                      languageCode: language,
                      displayLanguageCode: 'en',
                    }),
                    value: language,
                  }))}
                  onChange={setLanguageCode}
                  hideLabel
                />
              </Input>
            </Section>
          )}
          <Section>
            <Label>Ballot Type</Label>
            <Input>
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
            </Input>
          </Section>
          <Section>
            <Label>Copies</Label>
            <Input>
              <NumberInput
                value={numCopies}
                onChange={(value) => setNumCopies(value || 0)}
                style={{ width: '4rem' }}
              />
            </Input>
          </Section>
        </React.Fragment>
      }
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button icon="Print" variant="primary" onPress={handlePrint}>
            Print {numberOfBallotStyles} Ballot Styles
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}

export function PrintAllButton({
  disabled,
}: {
  disabled: boolean;
}): JSX.Element {
  const [isShowingModal, setIsShowingModal] = useState(false);

  return (
    <React.Fragment>
      <StyledButton
        disabled={disabled}
        color="neutral"
        fill="outlined"
        onPress={() => setIsShowingModal(true)}
      >
        Print All Ballot Styles
      </StyledButton>
      {isShowingModal && (
        <PrintAllModal onClose={() => setIsShowingModal(false)} />
      )}
    </React.Fragment>
  );
}
