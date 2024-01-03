import React, { useState, useContext, useCallback } from 'react';
import {
  Admin,
  Election,
  ElectionDefinition,
  ElementWithCallback,
  getPrecinctById,
  PrecinctId,
} from '@votingworks/types';
import { assert, sleep } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  BmdPaperBallot,
  Button,
  useCancelablePromise,
  Modal,
  printElement,
  printElementToPdfWhenReady,
  P,
  H6,
  ModalWidth,
} from '@votingworks/ui';
import {
  generateTestDeckBallots,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { TestDeckTallyReport } from '../components/test_deck_tally_report';
import { generateResultsFromTestDeckBallots } from '../utils/election';
import { PrintButton } from '../components/print_button';
import {
  SaveFrontendFileModal,
  FileType,
} from '../components/save_frontend_file_modal';
import { generateDefaultReportFilename } from '../utils/save_as_pdf';
import { routerPaths } from '../router_paths';

export const TITLE = 'Precinct L&A Packages';

export const ONE_SIDED_PAGE_PRINT_TIME_MS = 3000;

interface PrecinctTallyReportProps {
  electionDefinition: ElectionDefinition;
  tallyReportResults: Admin.TallyReportResults;
  precinctId: PrecinctId;
}

const ButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
`;

const ButtonRow = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr;
`;

async function generateResultsForPrecinctTallyReport({
  electionDefinition,
  precinctId,
}: {
  electionDefinition: ElectionDefinition;
  precinctId: PrecinctId;
}): Promise<Admin.TallyReportResults> {
  const { election } = electionDefinition;

  return generateResultsFromTestDeckBallots({
    electionDefinition,
    testDeckBallots: [
      ...generateTestDeckBallots({
        election,
        precinctId,
        markingMethod: 'hand',
      }),
      ...generateTestDeckBallots({
        election,
        precinctId,
        markingMethod: 'machine',
      }),
    ],
    precinctId,
  });
}

function PrecinctTallyReport({
  electionDefinition,
  tallyReportResults,
  precinctId,
}: PrecinctTallyReportProps): JSX.Element {
  // Precinct test deck tallies should be twice that of a single test
  // deck because it counts scanning 2 test decks (BMD + HMPB)
  return (
    <TestDeckTallyReport
      electionDefinition={electionDefinition}
      tallyReportResults={tallyReportResults}
      precinctId={precinctId}
    />
  );
}

interface BmdPaperBallotsProps {
  electionDefinition: ElectionDefinition;
  precinctId: PrecinctId;
  generateBallotId: () => string;
}

function getBmdPaperBallots({
  electionDefinition,
  precinctId,
  generateBallotId,
}: BmdPaperBallotsProps): JSX.Element[] {
  const { election } = electionDefinition;
  const ballots = generateTestDeckBallots({
    election,
    precinctId,
    markingMethod: 'machine',
  });

  return ballots.map((ballot, i) => (
    <BmdPaperBallot
      ballotStyleId={ballot.ballotStyleId}
      electionDefinition={electionDefinition}
      generateBallotId={generateBallotId}
      isLiveMode={false}
      key={`ballot-${i}`} // eslint-disable-line react/no-array-index-key
      precinctId={ballot.precinctId}
      votes={ballot.votes}
    />
  ));
}

function getBmdPaperBallotsWithOnReadyCallback({
  electionDefinition,
  precinctId,
  generateBallotId,
}: BmdPaperBallotsProps): ElementWithCallback[] {
  const { election } = electionDefinition;
  const ballots = generateTestDeckBallots({
    election,
    precinctId,
    markingMethod: 'machine',
  });

  return ballots.map((ballot, i) => {
    function BmdPaperBallotWithCallback(onReady: VoidFunction): JSX.Element {
      return (
        <BmdPaperBallot
          ballotStyleId={ballot.ballotStyleId}
          electionDefinition={electionDefinition}
          generateBallotId={generateBallotId}
          isLiveMode={false}
          key={`ballot-${i}`} // eslint-disable-line react/no-array-index-key
          precinctId={ballot.precinctId}
          votes={ballot.votes}
          onRendered={onReady}
        />
      );
    }

    return BmdPaperBallotWithCallback;
  });
}

interface PrintIndex {
  precinctIds: PrecinctId[];
  precinctIndex: number;
}

interface PrintingModalProps {
  printIndex: PrintIndex;
  election: Election;
}

function PrintingModal({
  printIndex,
  election,
}: PrintingModalProps): JSX.Element {
  const currentPrecinct = getPrecinctById({
    election,
    precinctId: printIndex.precinctIds[printIndex.precinctIndex],
  });
  assert(currentPrecinct);

  return (
    <Modal
      centerContent
      modalWidth={ModalWidth.Wide}
      content={
        <React.Fragment>
          <P weight="bold">
            <Loading as="span">
              {`Printing L&A Package for ${currentPrecinct.name}`}
            </Loading>
          </P>
          {printIndex.precinctIds.length > 1 && (
            <P>
              This is package {printIndex.precinctIndex + 1} of{' '}
              {printIndex.precinctIds.length}.
            </P>
          )}
        </React.Fragment>
      }
    />
  );
}

export function PrintTestDeckScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const { electionDefinition, auth, logger, generateBallotId } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth)); // TODO(auth) should this check for a specific user type
  const userRole = auth.user.role;
  const { election } = electionDefinition;
  const [printIndex, setPrintIndex] = useState<PrintIndex>();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [precinctToSaveToPdf, setPrecinctToSaveToPdf] =
    useState<PrecinctId>('all');
  const currentPrecinct = getPrecinctById({
    election,
    precinctId: precinctToSaveToPdf,
  });

  const generatePrecinctIds = useCallback(
    (precinctId: PrecinctId) => {
      if (precinctId === 'all') {
        const sortedPrecincts = [...election.precincts].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            ignorePunctuation: true,
          })
        );
        return sortedPrecincts.map((p) => p.id);
      }

      return [precinctId];
    },
    [election.precincts]
  );

  const printPrecinctTallyReport = useCallback(
    async (precinctId: PrecinctId) => {
      const parties = new Set(election.ballotStyles.map((bs) => bs.partyId));
      const numParties = Math.max(parties.size, 1);

      const tallyReportResults = await generateResultsForPrecinctTallyReport({
        electionDefinition,
        precinctId,
      });
      await printElement(
        PrecinctTallyReport({
          electionDefinition,
          tallyReportResults,
          precinctId,
        }),
        {
          sides: 'one-sided',
        }
      );
      await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'success',
        message: `Test deck tally report printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });
      await makeCancelable(sleep(numParties * ONE_SIDED_PAGE_PRINT_TIME_MS));
    },
    [election, electionDefinition, logger, makeCancelable, userRole]
  );

  const printBmdPaperBallots = useCallback(
    async (precinctId: PrecinctId) => {
      const bmdPaperBallots = getBmdPaperBallots({
        electionDefinition,
        precinctId,
        generateBallotId,
      });
      await printElement(<React.Fragment>{bmdPaperBallots}</React.Fragment>, {
        sides: 'one-sided',
      });
      await logger.log(LogEventId.TestDeckPrinted, userRole, {
        disposition: 'success',
        message: `BMD paper ballot test deck printed as part of L&A package for precinct ID: ${precinctId}`,
        precinctId,
      });
      await makeCancelable(
        sleep(bmdPaperBallots.length * ONE_SIDED_PAGE_PRINT_TIME_MS)
      );
    },
    [electionDefinition, logger, makeCancelable, userRole, generateBallotId]
  );

  const printLogicAndAccuracyPackage = useCallback(
    async (precinctId: PrecinctId) => {
      const precinctIds = generatePrecinctIds(precinctId);

      for (const [
        currentPrecinctIndex,
        currentPrecinctId,
      ] of precinctIds.entries()) {
        setPrintIndex({
          precinctIds,
          precinctIndex: currentPrecinctIndex,
        });
        await printPrecinctTallyReport(currentPrecinctId);
        await printBmdPaperBallots(currentPrecinctId);
      }

      // We're done printing
      setPrintIndex(undefined);
    },
    [generatePrecinctIds, printBmdPaperBallots, printPrecinctTallyReport]
  );

  const onClickSaveLogicAndAccuracyPackageToPdf = useCallback(
    (precinctId: PrecinctId) => {
      setPrecinctToSaveToPdf(precinctId);
      setIsSaveModalOpen(true);
    },
    []
  );

  const renderLogicAndAccuracyPackageToPdfForSinglePrecinct = useCallback(
    (
      precinctId: PrecinctId,
      tallyReportResults: Admin.TallyReportResults,
      bmdPaperBallotCallbacks: ElementWithCallback[],
      onRendered: () => void
    ): JSX.Element => {
      return (
        <React.Fragment key={precinctId}>
          {PrecinctTallyReport({
            electionDefinition,
            precinctId,
            tallyReportResults,
          })}
          {bmdPaperBallotCallbacks.map((bmdMarkedPaperBallotWithCallback) =>
            bmdMarkedPaperBallotWithCallback(onRendered)
          )}
        </React.Fragment>
      );
    },
    [electionDefinition]
  );

  // printLogicAndAccuracyPackageToPdf prints the L&A package for all precincts to PDF format.
  // It returns a Promise<Uint8Array> to be consumed by SaveFileToUsb
  const printLogicAndAccuracyPackageToPdf =
    useCallback(async (): Promise<Uint8Array> => {
      const precinctIds = generatePrecinctIds(precinctToSaveToPdf);

      // If printing all precincts, render them all in a single call to printElementToPdfWhenReady.
      // Uint8Arrays can't easily be combined later without causing PDF rendering issues.

      // Prepare to render all BMD paper ballots across all precincts
      let numBallots = 0;
      const bmdPaperBallotsCallbacks = precinctIds.map((precinctId) => {
        const bmdPaperBallotsWithCallback =
          getBmdPaperBallotsWithOnReadyCallback({
            electionDefinition,
            precinctId,
            generateBallotId,
          });
        numBallots += bmdPaperBallotsWithCallback.length;
        return bmdPaperBallotsWithCallback;
      });

      const allTallyReportResults: Record<string, Admin.TallyReportResults> =
        {};
      for (const precinctId of precinctIds) {
        allTallyReportResults[precinctId] =
          await generateResultsForPrecinctTallyReport({
            electionDefinition,
            precinctId,
          });
      }

      return printElementToPdfWhenReady((onAllRendered) => {
        // Printing will wait until all ballots in all precincts have rendered
        let numRendered = 0;
        function onRendered() {
          numRendered += 1;
          if (numRendered === numBallots) {
            onAllRendered();
          }
        }

        return (
          <React.Fragment>
            {precinctIds.map((precinctId, i) => {
              const callbacksForPrecinct = bmdPaperBallotsCallbacks[i];
              return renderLogicAndAccuracyPackageToPdfForSinglePrecinct(
                precinctId,
                allTallyReportResults[precinctId],
                callbacksForPrecinct,
                onRendered
              );
            })}
          </React.Fragment>
        );
      });
    }, [
      generatePrecinctIds,
      precinctToSaveToPdf,
      electionDefinition,
      generateBallotId,
      renderLogicAndAccuracyPackageToPdfForSinglePrecinct,
    ]);

  return (
    <React.Fragment>
      {printIndex && (
        <PrintingModal election={election} printIndex={printIndex} />
      )}
      <NavigationScreen
        title={TITLE}
        parentRoutes={[{ title: 'L&A', path: routerPaths.logicAndAccuracy }]}
      >
        <P>
          Print the L&A Packages for all precincts, or for a specific precinct,
          by selecting a button below.
        </P>
        <H6 as="h2">Each Precinct L&A Package prints:</H6>
        <ol>
          <P>
            <li>
              A Precinct Tally Report — the expected results of the precinct.
            </li>
          </P>
          <P>
            <li>Pre-voted VxMark test ballots.</li>
          </P>
          <P>
            <li>Pre-voted hand-marked test ballots.</li>
          </P>
          <P>
            <li>
              Two blank hand-marked test ballots — one remains blank, one is
              hand-marked by an election official to replace a pre-voted
              hand-marked test ballot.
            </li>
          </P>
          <P>
            <li>One overvoted hand-marked test ballot.</li>
          </P>
        </ol>
        <ButtonsContainer>
          <ButtonRow>
            <PrintButton
              print={() => printLogicAndAccuracyPackage('all')}
              useDefaultProgressModal={false}
              variant="primary"
            >
              Print Packages for All Precincts
            </PrintButton>
            {window.kiosk && (
              <Button
                onPress={() => onClickSaveLogicAndAccuracyPackageToPdf('all')}
              >
                Save Packages for All Precincts as PDF
              </Button>
            )}
          </ButtonRow>
          <React.Fragment>
            {[...election.precincts]
              .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                  ignorePunctuation: true,
                })
              )
              .map((p) => (
                <ButtonRow key={p.id}>
                  <PrintButton
                    print={() => printLogicAndAccuracyPackage(p.id)}
                    useDefaultProgressModal={false}
                  >
                    Print {p.name}
                  </PrintButton>
                  {window.kiosk && (
                    <Button
                      onPress={() =>
                        onClickSaveLogicAndAccuracyPackageToPdf(p.id)
                      }
                    >
                      Save {p.name} to PDF
                    </Button>
                  )}
                </ButtonRow>
              ))}
          </React.Fragment>
        </ButtonsContainer>
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFrontendFileModal
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() => printLogicAndAccuracyPackageToPdf()}
          defaultFilename={generateDefaultReportFilename(
            'test-deck-logic-and-accuracy-report',
            election,
            precinctToSaveToPdf === 'all'
              ? 'all-precincts'
              : currentPrecinct?.name
          )}
          fileType={FileType.LogicAndAccuracyPackage}
        />
      )}
    </React.Fragment>
  );
}
