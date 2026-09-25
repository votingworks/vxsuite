import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  Loading,
  Modal,
  NumberInput,
  P,
  RadioGroup,
  SegmentedButton,
  getPrintOutcome,
  PrintJobFailedModal,
} from '@votingworks/ui';
import { BallotType, LanguageCode, type PrintJobId } from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { format, getLanguageOptions } from '@votingworks/utils';
import {
  getDistinctBallotStylesCount,
  getElectionRecord,
  getPrintJobStatus,
  printAllBallotStyles,
} from '../api.js';
import { PRINT_HANDOFF_MODAL_LINGER_SECONDS } from '../constants.js';

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

// @coverage-defer
function PrintAllModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const printAllMutation = printAllBallotStyles.useMutation();
  const [isAbsentee, setIsAbsentee] = useState(false);
  const ballotType = isAbsentee ? BallotType.Absentee : BallotType.Precinct;
  const [numCopies, setNumCopies] = useState(1);
  const [languageCode, setLanguageCode] = useState(LanguageCode.ENGLISH);
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getDistinctBallotStylesCountQuery =
    getDistinctBallotStylesCount.useQuery({ ballotType, languageCode });

  const [printJobId, setPrintJobId] = useState<PrintJobId>();
  const printJobStatusQuery = getPrintJobStatus.useQuery(printJobId);
  const printOutcome =
    printJobId === undefined
      ? undefined
      : getPrintOutcome(printJobStatusQuery.data);
  const printFailureReason = printJobStatusQuery.data?.ok()?.reason;

  useEffect(() => {
    if (printOutcome !== 'sent-to-printer') {
      return;
    }
    const timeout = setTimeout(
      onClose,
      PRINT_HANDOFF_MODAL_LINGER_SECONDS * 1000
    );
    return () => clearTimeout(timeout);
  }, [printOutcome, onClose]);

  if (
    !getElectionRecordQuery.isSuccess ||
    getDistinctBallotStylesCountQuery.data === undefined
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
    printAllMutation.mutate(
      {
        ballotType,
        copiesPerStyle: numCopies,
        languageCode,
      },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            setPrintJobId(result.ok());
          }
        },
      }
    );
  }

  if (printAllMutation.isSuccess && printAllMutation.data.isErr()) {
    const error = printAllMutation.data.err();
    switch (error) {
      case 'job_too_large':
        return (
          <Modal
            title="Ballots Not Printed"
            content={
              <P>
                The print job was too large. Please try printing fewer copies or
                choose a single ballot style.
              </P>
            }
            actions={<Button onPress={onClose}>Close</Button>}
          />
        );
      default:
        throwIllegalValue(error);
    }
  }

  if (printOutcome === 'failed') {
    return (
      <PrintJobFailedModal
        multipleBallotsAttempted
        reason={printFailureReason}
        onClose={onClose}
      />
    );
  }

  if (printAllMutation.isLoading || printJobId !== undefined) {
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
          <Button
            icon="Print"
            variant="primary"
            onPress={handlePrint}
            disabled={!getDistinctBallotStylesCountQuery.isSuccess}
          >
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
  const closeModal = useCallback(() => setIsShowingModal(false), []);

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
      {isShowingModal && <PrintAllModal onClose={closeModal} />}
    </React.Fragment>
  );
}
