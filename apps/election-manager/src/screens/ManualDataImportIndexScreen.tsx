import { strict as assert } from 'assert';
import React, { ReactChild, useContext, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import { Table, TD } from '@votingworks/ui';
import {
  ExternalTallySourceType,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { ResultsFileType } from '../config/types';
import routerPaths from '../routerPaths';

import AppContext from '../contexts/AppContext';

import Prose from '../components/Prose';

import NavigationScreen from '../components/NavigationScreen';
import Button, { SegmentedButton } from '../components/Button';
import Text from '../components/Text';
import {
  convertTalliesByPrecinctToFullExternalTally,
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
} from '../utils/externalTallies';
import LinkButton from '../components/LinkButton';
import { ConfirmRemovingFileModal } from '../components/ConfirmRemovingFileModal';

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

const ManualDataImportIndexScreen = (): JSX.Element => {
  const {
    electionDefinition,
    fullElectionExternalTallies,
    saveExternalTallies,
    resetFiles,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const history = useHistory();

  const existingManualDataTallies = fullElectionExternalTallies.filter(
    (t) => t.source === ExternalTallySourceType.Manual
  );
  const existingManualData =
    existingManualDataTallies.length === 1
      ? existingManualDataTallies[0]
      : undefined;
  const existingTalliesByPrecinct = existingManualData?.resultsByCategory.get(
    TallyCategory.Precinct
  );
  const talliesByPrecinct =
    existingTalliesByPrecinct ?? getEmptyExternalTalliesByPrecinct(election);
  const [ballotType, setBallotType] = useState<VotingMethod>(
    existingManualData?.votingMethod ?? VotingMethod.Precinct
  );
  const [isClearing, setIsClearing] = useState(false);
  const hasManualData = !!existingManualData?.overallTally
    .numberOfBallotsCounted;

  const confirmClearManualData = async (fileType: ResultsFileType) => {
    setIsClearing(false);
    await resetFiles(fileType);
  };

  const handleSettingBallotType = async (newBallotType: VotingMethod) => {
    setBallotType(newBallotType);

    // Note this WILL save an empty external tally if ballot type is toggled but there is not an external tally yet.
    const externalTally = convertTalliesByPrecinctToFullExternalTally(
      talliesByPrecinct,
      election,
      newBallotType,
      ExternalTallySourceType.Manual,
      MANUAL_DATA_NAME,
      new Date()
    );
    // Don't modify any external tallies for non-manual data
    const newTallies = fullElectionExternalTallies.filter(
      (t) => t.source !== ExternalTallySourceType.Manual
    );
    // Add the new tally
    newTallies.push(externalTally);
    await saveExternalTallies(newTallies);
  };

  useEffect(() => {
    // If the data gets cleared, reset voting method.
    if (existingManualData === undefined) {
      setBallotType(VotingMethod.Precinct);
    }
  }, [existingManualData]);

  const votingMethodName =
    ballotType === VotingMethod.Absentee ? 'Absentee' : 'Precinct';

  let totalNumberBallotsEntered = 0;
  const enteredDataRows: ReactChild[] = [];
  for (const precinct of election.precincts) {
    /* istanbul ignore next */
    const tally = talliesByPrecinct[precinct.id] ?? getEmptyExternalTally();
    enteredDataRows.push(
      <tr key={precinct.id}>
        <TD>
          <PrecinctRowText noWrap>{precinct.name}</PrecinctRowText>
        </TD>
        <TD nowrap textAlign="center" data-testid="numBallots">
          <PrecinctRowText>{tally.numberOfBallotsCounted}</PrecinctRowText>
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
    totalNumberBallotsEntered += tally.numberOfBallotsCounted;
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
                  disabled={ballotType === VotingMethod.Precinct}
                  onPress={() => handleSettingBallotType(VotingMethod.Precinct)}
                >
                  Precinct Results
                </Button>
                <Button
                  data-testid="ballottype-absentee"
                  disabled={ballotType === VotingMethod.Absentee}
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
                Clear Manual Data…
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
};

export default ManualDataImportIndexScreen;
