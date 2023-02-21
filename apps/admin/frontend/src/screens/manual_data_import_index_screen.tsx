import { assert } from '@votingworks/basics';
import React, { ReactChild, useContext, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import {
  Button,
  SegmentedButton,
  Prose,
  Table,
  TD,
  Text,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import {
  ExternalTallySourceType,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import { ResultsFileType } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { convertTalliesByPrecinctToFullExternalTally } from '../utils/external_tallies';
import { LinkButton } from '../components/link_button';
import { ConfirmRemovingFileModal } from '../components/confirm_removing_file_modal';

const MANUAL_DATA_NAME = 'Manually Added Data';

const SummaryInfo = styled.div`
  align-self: flex-start;
  position: sticky;
  top: 0;
`;

const PrecinctRowText = styled(Text)`
  &&& {
    margin: 0;
    padding: 0;
  }
`;

export function ManualDataImportIndexScreen(): JSX.Element {
  const {
    electionDefinition,
    fullElectionExternalTallies,
    updateExternalTally,
    manualTallyVotingMethod,
    setManualTallyVotingMethod,
    resetFiles,
    auth,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const userRole = auth.user.role;
  const { election } = electionDefinition;
  const history = useHistory();

  const existingManualData = fullElectionExternalTallies.get(
    ExternalTallySourceType.Manual
  );
  const existingTalliesByPrecinct = existingManualData?.resultsByCategory.get(
    TallyCategory.Precinct
  );
  const [isClearing, setIsClearing] = useState(false);
  const hasManualData =
    !!existingManualData?.overallTally.numberOfBallotsCounted;

  async function confirmClearManualData(fileType: ResultsFileType) {
    setIsClearing(false);
    await resetFiles(fileType);
  }

  async function handleSettingBallotType(newBallotType: VotingMethod) {
    setManualTallyVotingMethod(newBallotType);

    if (existingTalliesByPrecinct) {
      const externalTally = convertTalliesByPrecinctToFullExternalTally(
        existingTalliesByPrecinct,
        election,
        newBallotType,
        ExternalTallySourceType.Manual,
        MANUAL_DATA_NAME,
        new Date()
      );
      await updateExternalTally(externalTally);
    }

    await logger.log(LogEventId.ManualTallyDataEdited, userRole, {
      disposition: 'success',
      newBallotType,
      message: `Ballot type for manually entered tally data changed to ${newBallotType}`,
    });
  }

  useEffect(() => {
    // If the data gets cleared, reset voting method.
    if (existingManualData === undefined) {
      setManualTallyVotingMethod(VotingMethod.Precinct);
    }
  }, [existingManualData, setManualTallyVotingMethod]);

  const votingMethodName =
    manualTallyVotingMethod === VotingMethod.Absentee ? 'Absentee' : 'Precinct';

  let totalNumberBallotsEntered = 0;
  const enteredDataRows: ReactChild[] = [];
  for (const precinct of election.precincts) {
    /* istanbul ignore next */
    const numberOfBallotsCounted = existingTalliesByPrecinct
      ? existingTalliesByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0
      : 0;
    enteredDataRows.push(
      <tr key={precinct.id}>
        <TD>
          <PrecinctRowText noWrap>{precinct.name}</PrecinctRowText>
        </TD>
        <TD nowrap textAlign="center" data-testid="numBallots">
          <PrecinctRowText>{numberOfBallotsCounted}</PrecinctRowText>
        </TD>
        <TD nowrap>
          <LinkButton
            small
            to={routerPaths.manualDataImportForPrecinct({
              precinctId: precinct.id,
            })}
          >
            Edit {votingMethodName} Results for {precinct.name}
          </LinkButton>
        </TD>
      </tr>
    );
    totalNumberBallotsEntered += numberOfBallotsCounted;
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <SummaryInfo>
          <Prose maxWidth={false}>
            <p>
              <Button onPress={() => history.push(routerPaths.tally)}>
                Back to Tally
              </Button>
            </p>
            <p>Select the voting method for manually entered results:</p>
            <p>
              <SegmentedButton>
                <Button
                  data-testid="ballottype-precinct"
                  disabled={manualTallyVotingMethod === VotingMethod.Precinct}
                  onPress={() => handleSettingBallotType(VotingMethod.Precinct)}
                >
                  Precinct Results
                </Button>
                <Button
                  data-testid="ballottype-absentee"
                  disabled={manualTallyVotingMethod === VotingMethod.Absentee}
                  onPress={() => handleSettingBallotType(VotingMethod.Absentee)}
                >
                  Absentee Results
                </Button>
              </SegmentedButton>
            </p>
            <h1>Manually Entered {votingMethodName} Results</h1>
            <Table condensed data-testid="summary-data">
              <thead>
                <tr>
                  <TD as="th" narrow>
                    Precinct
                  </TD>
                  <TD as="th" nowrap narrow textAlign="center">
                    Manual Ballot Count
                  </TD>
                  <TD as="th" />
                </tr>
              </thead>
              <tbody>
                {enteredDataRows}
                <tr>
                  <TD>
                    <strong>Total</strong>
                  </TD>
                  <TD textAlign="center" data-testid="total-ballots-entered">
                    <strong>{totalNumberBallotsEntered}</strong>
                  </TD>
                  <TD />
                </tr>
              </tbody>
            </Table>
            <p>
              <Button
                danger
                disabled={!hasManualData}
                onPress={() => setIsClearing(true)}
              >
                Clear Manual Data
              </Button>
            </p>
          </Prose>
        </SummaryInfo>
      </NavigationScreen>
      {isClearing && (
        <ConfirmRemovingFileModal
          fileType={ResultsFileType.Manual}
          onConfirm={confirmClearManualData}
          onCancel={() => setIsClearing(false)}
        />
      )}
    </React.Fragment>
  );
}
