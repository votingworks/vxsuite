import { useContext, useState } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import {
  Button,
  Icons,
  RouterTabBar,
  MainContent,
  DesktopPalette,
  Font,
  Card,
} from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { isCombinedBallotPrimary } from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';
import { NavScreenLite } from '../../components/navigation_screen';
import { ManualTalliesTab } from './manual_tallies_tab';
import { routerPaths } from '../../router_paths';
import { ConfirmRemoveAllResultsModal } from './confirm_remove_all_results_modal';
import { BORDER_LIGHT, GAP } from './styles';
import { CvrsScreen } from './cvrs_screen';
import { ScannersTab } from './scanners_tab';

const Container = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  overflow-y: hidden;
  height: 100%;
`;

const BODY_WITH_BANNER_CSS = css`
  grid-template-rows: min-content 1fr;
`;

const Body = styled.div<{ withBanner: boolean }>`
  display: grid;
  grid-template-rows: 1fr;
  overflow-y: hidden;
  position: relative;
  height: 100%;

  ${(p) => p.withBanner && BODY_WITH_BANNER_CSS}
`;

const Content = styled.div`
  height: 100%;
  overflow-y: hidden;
  position: relative;
`;

const OfficialCard = styled(Card)`
  ${BORDER_LIGHT}
  margin: ${GAP} ${GAP} 0;

  > * {
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding: ${GAP};
    padding-left: calc(1.5 * ${GAP}); /* Balance out with icon/text gap. */
  }
`;

const TabBar = styled(RouterTabBar)`
  border-color: ${DesktopPalette.Gray30};
  gap: ${GAP};
  padding: ${GAP} ${GAP} 0;
`;

export function TallyScreen(): JSX.Element | null {
  const ctx = useContext(AppContext);
  const { electionDefinition, isOfficialResults, auth } = ctx;
  const { election } = assertDefined(electionDefinition);
  assert(isElectionManagerAuth(auth));

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const tabs: Array<{ title: string; path: string }> = [
    { title: 'Cast Vote Records', path: routerPaths.tallyCvrs },
    { title: 'Networked Scanners', path: routerPaths.tallyScanners },
  ];

  const manualTalliesEnabled = !isCombinedBallotPrimary(election);
  if (manualTalliesEnabled) {
    tabs.push({ title: 'Manual Tallies', path: routerPaths.tallyManual });
  }

  return (
    <NavScreenLite>
      <Container>
        <TabBar tabs={tabs} />

        <Body withBanner={isOfficialResults}>
          {isOfficialResults && (
            <OfficialCard>
              <Font style={{ fontSize: '1.125rem' }} weight="bold">
                <Icons.Done color="success" style={{ marginRight: GAP }} />
                Election Results are Official
              </Font>
              <Button
                onPress={() => setConfirmingDelete(true)}
                icon="Trash"
                color="danger"
              >
                Remove All Tallies
              </Button>
            </OfficialCard>
          )}

          <Content>
            <Switch>
              <Route
                exact
                path={routerPaths.tallyCvrs}
                component={CvrsScreen}
              />

              <Route
                exact
                path={routerPaths.tallyScanners}
                component={ScannersTab}
              />

              {manualTalliesEnabled && (
                <Route exact path={routerPaths.tallyManual}>
                  <MainContent style={{ height: '100%', padding: `0 ${GAP}` }}>
                    <ManualTalliesTab />
                  </MainContent>
                </Route>
              )}

              <Redirect from={routerPaths.tally} to={routerPaths.tallyCvrs} />
            </Switch>
          </Content>
        </Body>
      </Container>

      {confirmingDelete && (
        <ConfirmRemoveAllResultsModal
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </NavScreenLite>
  );
}
