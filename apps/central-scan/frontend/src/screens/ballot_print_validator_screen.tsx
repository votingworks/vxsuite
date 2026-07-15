import { assertDefined } from '@votingworks/basics';
import type {
  BallotPrintSideValidation,
  SheetPrintValidation,
} from '@votingworks/central-scan-backend';
import {
  DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
  SheetOf,
} from '@votingworks/types';
import {
  Button,
  Font,
  H1,
  H2,
  Icons,
  LoadingButton,
  Main,
  MainContent,
  MainHeader,
  Modal,
  P,
  Screen,
  TD,
  Table,
} from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

import {
  acknowledgeInvalidBallotPrint,
  clearBallotPrintValidation,
  getBallotPrintValidationStatus,
  scanBallotsForPrintValidation,
} from '../api';

const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Status = styled.div`
  display: flex;
  gap: 1rem;
`;

const BallotImages = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;

  img {
    border: 1px solid ${(p) => p.theme.colors.outline};
    max-height: 50vh;
    max-width: 45%;
  }
`;

const FormattedErrorDetails = styled.pre`
  font-size: 0.7rem;
  margin: 0;
  margin-top: 0.25rem;
  white-space: pre-wrap;
  word-break: break-word;
`;

function getSideProblems(side: BallotPrintSideValidation): string[] {
  return [
    !side.timingMarksDetected && 'Timing marks did not register.',
    !side.qrCodeDetected && 'QR code could not be read.',
    side.scale !== undefined &&
      side.scale < DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE &&
      `Ballot scale too low (${(side.scale * 100).toFixed(1)}%).`,
  ].filter((problem): problem is string => typeof problem === 'string');
}

function SideStatus({
  side,
}: {
  side: BallotPrintSideValidation;
}): JSX.Element {
  return getSideProblems(side).length === 0 ? (
    <span>
      <Icons.Done color="success" /> OK
    </span>
  ) : (
    <span>
      <Icons.Warning color="warning" /> Bad print
    </span>
  );
}

function SideDetails({
  label,
  side,
}: {
  label: 'Front' | 'Back';
  side: BallotPrintSideValidation;
}): JSX.Element | null {
  const problems = getSideProblems(side);
  if (problems.length === 0) {
    return null;
  }
  return (
    <P>
      <Font weight="bold">{label}:</Font> {problems.join(' ')}
      {!side.timingMarksDetected && (
        <FormattedErrorDetails>{side.timingMarksError}</FormattedErrorDetails>
      )}
    </P>
  );
}

function BadPrintModal({
  sheet,
  images,
  onContinue,
  isContinuing,
}: {
  sheet: SheetPrintValidation;
  images?: SheetOf<string>;
  onContinue: () => void;
  isContinuing: boolean;
}): JSX.Element {
  return (
    <Modal
      title={
        <span>
          <Icons.Warning color="warning" /> Bad Print Detected
        </span>
      }
      content={
        <React.Fragment>
          <P>
            Ballot {sheet.sheetNumber} did not pass print validation. Remove it
            from the output stack before continuing.
          </P>
          <SideDetails label="Front" side={sheet.front} />
          <SideDetails label="Back" side={sheet.back} />
          {images && (
            <BallotImages>
              <img src={images[0]} alt="Front" />
              <img src={images[1]} alt="Back" />
            </BallotImages>
          )}
        </React.Fragment>
      }
      actions={
        <Button
          variant="primary"
          onPress={onContinue}
          disabled={isContinuing}
          autoFocus
        >
          Ballot Removed, Continue Scanning
        </Button>
      }
    />
  );
}

function DetailsModal({
  sheet,
  onClose,
}: {
  sheet: SheetPrintValidation;
  onClose: () => void;
}): JSX.Element {
  return (
    <Modal
      title="Bad Print Details"
      content={
        <React.Fragment>
          <SideDetails label="Front" side={sheet.front} />
          <SideDetails label="Back" side={sheet.back} />
        </React.Fragment>
      }
      actions={<Button onPress={onClose}>Close</Button>}
    />
  );
}

/**
 * Validates printed ballots by scanning a stack and checking, for each sheet,
 * that timing marks and ballot QR codes can be read. Requires neither auth nor
 * an election package.
 */
export function BallotPrintValidatorScreen(): JSX.Element {
  const statusQuery = getBallotPrintValidationStatus.useQuery();
  const scanMutation = scanBallotsForPrintValidation.useMutation();
  const clearMutation = clearBallotPrintValidation.useMutation();
  const acknowledgeMutation = acknowledgeInvalidBallotPrint.useMutation();

  const status = statusQuery.data;
  const isScannerAttached = status?.isScannerAttached ?? false;
  const state = status?.state ?? 'idle';
  const isScanning = state !== 'idle';
  const hasResults = (status?.sheetsValidated ?? 0) > 0;

  const [viewingDetailsFor, setViewingDetailsFor] = React.useState<number>();

  return (
    <Screen flexDirection="row">
      <Main flexColumn>
        <Header>
          <H1>Ballot Print Validator</H1>
          <HeaderActions>
            <Button
              disabled={isScanning || !hasResults}
              onPress={() => clearMutation.mutate()}
            >
              Clear Results
            </Button>
            {scanMutation.isLoading || isScanning ? (
              <LoadingButton>Scanning</LoadingButton>
            ) : (
              <Button
                disabled={!isScannerAttached}
                onPress={() => scanMutation.mutate()}
                variant="primary"
              >
                {isScannerAttached ? 'Scan Ballots' : 'No Scanner Detected'}
              </Button>
            )}
          </HeaderActions>
        </Header>

        <MainContent>
          <Content>
            {status && (
              <Status>
                <span>
                  <Font weight="bold">Ballots scanned:</Font>{' '}
                  {status.sheetsValidated}
                </span>
                <span>
                  <Font weight="bold">Bad prints found:</Font>{' '}
                  {status.invalidSheets.length}
                </span>
              </Status>
            )}

            {status &&
              status.state === 'idle' &&
              status.sheetsValidated > 0 &&
              status.invalidSheets.length === 0 && (
                <P>
                  <Icons.Done color="success" /> No bad prints were found.
                </P>
              )}
            {status && status.invalidSheets.length > 0 && (
              <div>
                <H2>Bad Prints</H2>
                <Table>
                  <thead>
                    <tr>
                      <th>Ballot</th>
                      <th>Front</th>
                      <th>Back</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.invalidSheets.map((sheet) => (
                      <tr key={sheet.sheetNumber}>
                        <TD>{sheet.sheetNumber}</TD>
                        <TD>
                          <SideStatus side={sheet.front} />
                        </TD>
                        <TD>
                          <SideStatus side={sheet.back} />
                        </TD>
                        <TD>
                          <Button
                            onPress={() =>
                              setViewingDetailsFor(sheet.sheetNumber)
                            }
                          >
                            View Details
                          </Button>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Content>
        </MainContent>
      </Main>

      {status?.state === 'paused' && status.pausedOnSheet && (
        <BadPrintModal
          sheet={status.pausedOnSheet}
          images={status.pausedOnSheetImages}
          onContinue={() => acknowledgeMutation.mutate()}
          isContinuing={acknowledgeMutation.isLoading}
        />
      )}

      {viewingDetailsFor && (
        <DetailsModal
          sheet={assertDefined(
            status?.invalidSheets.find(
              (sheet) => sheet.sheetNumber === viewingDetailsFor
            )
          )}
          onClose={() => setViewingDetailsFor(undefined)}
        />
      )}
    </Screen>
  );
}
