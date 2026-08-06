import {
  AdjudicationReason,
  ContestId,
  formatBallotHash,
  mapSheet,
} from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  BallotImage,
  BallotImageHighlight,
  Button,
  H1,
  H2,
  H6,
  Icons,
  Main,
  P,
  Screen,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import React, { useContext } from 'react';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';
import { Header } from '../navigation_screen';
import {
  continueScanning,
  getNextReviewSheet,
  getSystemSettings,
} from '../api';

const AdjudicationHeader = styled(Header)`
  position: static;
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  border: none;
`;

const AdjudicationExplanation = styled.div`
  padding: 1rem;
  flex: 1;

  button {
    white-space: nowrap;
  }
`;

const BallotImagesContainer = styled.div`
  background: ${(p) => p.theme.colors.containerHigh};
  padding: 1rem;
  gap: 1em;
  display: flex;
  flex: 3;
`;

interface Props {
  isTestMode: boolean;
}

interface EjectInformation {
  header: string;
  body: React.ReactNode;
  allowBallotDuplication: boolean;
  highlightedContestIds?: Set<ContestId>;
}

export function BallotEjectScreen({ isTestMode }: Props): JSX.Element | null {
  const { auth, electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  const systemSettingsQuery = getSystemSettings.useQuery();
  const getNextReviewSheetQuery = getNextReviewSheet.useQuery();
  const continueScanningMutation = continueScanning.useMutation();

  function removeBallotAndContinueScanning() {
    continueScanningMutation.mutate({ forceAccept: false });
  }

  function acceptBallotAndContinueScanning() {
    continueScanningMutation.mutate({ forceAccept: true });
  }

  const reviewInfo = getNextReviewSheetQuery.data;

  if (!reviewInfo || !systemSettingsQuery.isSuccess) {
    return null;
  }

  const { disallowCastingOvervotes } = systemSettingsQuery.data;
  const { sheetInterpretation } = reviewInfo;

  const unreadableEjectInfo: EjectInformation = {
    header: 'Unreadable',
    body: (
      <React.Fragment>
        <P>
          The last scanned ballot was not tabulated because there was a problem
          reading the ballot.
        </P>
        <P>
          Remove the ballot and reload it into the scanner to try again. If the
          error persists, remove the ballot for manual adjudication.
        </P>
      </React.Fragment>
    ),
    allowBallotDuplication: false,
  };

  // We handle both NeedsReviewSheet and InvalidSheet interpretations,
  // since both need adjudication on the central scanner.
  // (The distinction is for the precinct scanner, which rejects
  // InvalidSheet and allows voter review for NeedsReviewSheet)
  const ejectInfo: EjectInformation = (() => {
    if (sheetInterpretation.type === 'InvalidSheet') {
      const { reason } = sheetInterpretation;
      switch (reason.type) {
        case 'vertical_streaks_detected':
          return {
            header: 'Streak Detected',
            body: (
              <React.Fragment>
                <P>
                  The last scanned ballot was not tabulated because the scanner
                  needs to be cleaned.
                </P>
                <P>Clean the scanner before continuing to scan ballots.</P>
              </React.Fragment>
            ),
            allowBallotDuplication: false,
          };

        case 'invalid_scale':
          return {
            header: 'Invalid Scale',
            body: (
              <React.Fragment>
                <P>The last scanned ballot was printed at an invalid scale.</P>
                <P>Ballots must be printed full-scale.</P>
              </React.Fragment>
            ),
            allowBallotDuplication: false,
          };

        case 'invalid_test_mode':
          return isTestMode
            ? {
                header: 'Official Ballot',
                body: (
                  <React.Fragment>
                    <P>
                      The last scanned ballot was not tabulated because it is an
                      official ballot but the scanner is in test ballot mode.
                    </P>
                    <P>Remove the ballot before continuing.</P>
                  </React.Fragment>
                ),
                allowBallotDuplication: false,
              }
            : {
                header: 'Test Ballot',
                body: (
                  <React.Fragment>
                    <P>
                      The last scanned ballot was not tabulated because it is a
                      test ballot but the scanner is in official ballot mode.
                    </P>
                    <P>Remove the ballot before continuing.</P>
                  </React.Fragment>
                ),
                allowBallotDuplication: false,
              };

        case 'invalid_ballot_hash':
          return {
            header: 'Wrong Election',
            body: (
              <React.Fragment>
                <P>
                  The last scanned ballot was not tabulated because it does not
                  match the election this scanner is configured for.
                </P>
                <H6>Ballot Election ID</H6>
                <P>{formatBallotHash(reason.actualBallotHash)}</P>
                <H6>Scanner Election ID</H6>
                <P>{formatBallotHash(electionDefinition.ballotHash)}</P>
                <br />
                <P>Remove the ballot before continuing.</P>
              </React.Fragment>
            ),
            allowBallotDuplication: false,
          };

        case 'invalid_precinct':
          return {
            header: 'Wrong Precinct',
            body: (
              <React.Fragment>
                <P>
                  The last scanned ballot was not tabulated because the scanner
                  is configured for a polling place that does not include the
                  ballot&apos;s precinct.
                </P>
                <P>Remove the ballot before continuing.</P>
              </React.Fragment>
            ),
            allowBallotDuplication: false,
          };

        case 'unreadable':
        case 'unknown':
          return unreadableEjectInfo;

        default:
          throwIllegalValue(reason);
      }
    }

    assert(sheetInterpretation.type === 'NeedsReviewSheet');
    const { reasons } = sheetInterpretation;

    if (reasons.some((r) => r.type === AdjudicationReason.CrossoverVoting)) {
      return {
        header: 'Crossover Voting',
        body: (
          <P>
            The last scanned ballot was not tabulated because votes were
            detected in contests for more than one party. If tabulated, those
            votes will not be counted.
          </P>
        ),
        allowBallotDuplication: true,
      };
    }

    if (reasons.some((r) => r.type === AdjudicationReason.Overvote)) {
      return {
        header: 'Overvote',
        body: (
          <P>
            The last scanned ballot was not tabulated because an overvote was
            detected.
          </P>
        ),
        allowBallotDuplication: !disallowCastingOvervotes,
        highlightedContestIds: new Set(
          reasons
            .filter((reason) => reason.type === AdjudicationReason.Overvote)
            .map((reason) => reason.contestId)
        ),
      };
    }

    if (reasons.some((r) => r.type === AdjudicationReason.BlankBallot)) {
      return {
        header: 'Blank Ballot',
        body: (
          <P>
            The last scanned ballot was not tabulated because no marks were
            detected.
          </P>
        ),
        allowBallotDuplication: true,
      };
    }

    if (reasons.some((r) => r.type === AdjudicationReason.Undervote)) {
      return {
        header: 'Undervote',
        body: (
          <P>
            The last scanned ballot was not tabulated because an undervote was
            detected.
          </P>
        ),
        allowBallotDuplication: true,
        highlightedContestIds: new Set(
          reasons
            .filter((reason) => reason.type === AdjudicationReason.Undervote)
            .map((reason) => reason.contestId)
        ),
      };
    }

    // @coverage-defer
    return unreadableEjectInfo;
  })();

  return (
    <Screen>
      <AdjudicationHeader>
        <H1>
          <Icons.Warning /> Ballot Not Counted
        </H1>
      </AdjudicationHeader>
      <Main flexRow>
        <AdjudicationExplanation>
          <H2>{ejectInfo.header}</H2>
          {ejectInfo.body}
          {ejectInfo.allowBallotDuplication ? (
            <React.Fragment>
              <P>
                Remove the ballot for manual adjudication or choose to tabulate
                it anyway.
              </P>
              <P>
                <Button
                  variant="primary"
                  onPress={removeBallotAndContinueScanning}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  Confirm Ballot Removed
                </Button>
              </P>
              <P>
                <Button
                  variant="primary"
                  onPress={acceptBallotAndContinueScanning}
                  style={{ width: '100%' }}
                >
                  Tabulate Ballot
                </Button>
              </P>
            </React.Fragment>
          ) : (
            <Button
              variant="primary"
              onPress={removeBallotAndContinueScanning}
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Confirm Ballot Removed
            </Button>
          )}
        </AdjudicationExplanation>
        <BallotImagesContainer>
          {mapSheet(reviewInfo.images, (pageImage, side) => {
            const highlights = pageImage.layout?.contests
              .filter(
                (contestLayout) =>
                  ejectInfo.highlightedContestIds?.has(contestLayout.contestId)
              )
              .map(
                (contestLayout): BallotImageHighlight => ({
                  bounds: contestLayout.bounds,
                  variant: 'warning',
                })
              );

            return (
              <div
                style={{
                  flex: 1,
                  height: '100%',
                }}
                key={side}
              >
                <BallotImage
                  style={{ margin: '0 auto' }}
                  imageUrl={pageImage.imageUrl}
                  ballotBounds={pageImage.ballotBounds}
                  highlights={highlights}
                />
              </div>
            );
          })}
        </BallotImagesContainer>
      </Main>
    </Screen>
  );
}
