import { useEffect, useState } from 'react';
import {
  Button,
  Callout,
  H6,
  Loading,
  P,
  QrCode,
  SearchSelect,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import styled from 'styled-components';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';
import {
  getMatchingAbsenteePollingPlaces,
  getLiveResultsReportingUrl,
} from '../../api';

export const TITLE = 'Send Tally Reports';

const SelectPollingPlaceContainer = styled.div`
  padding: 1rem 1rem 0;
  display: flex;
  gap: 0.5rem;
  align-items: center;

  > span {
    white-space: nowrap;
  }
`;

const FullPageMessage = styled.div`
  padding: 1rem;
`;

const QrSection = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
`;

export function SendTallyReportsScreen(): JSX.Element {
  const matchesQuery = getMatchingAbsenteePollingPlaces.useQuery();

  const [selectedPollingPlaceId, setSelectedPollingPlaceId] =
    useState<string>();
  const [currentQrIndex, setCurrentQrIndex] = useState(0);

  // Pick the effective polling place each render: honor the user's pick
  // only if it's still present in the latest matches (otherwise CVR
  // changes could leave a stale selection driving the URL signing call),
  // and fall back to auto-selecting when there is exactly one match.
  const matches = matchesQuery.data?.ok();
  const stillValidSelectedId = matches?.find(
    (p) => p.id === selectedPollingPlaceId
  )?.id;
  const pollingPlaceId =
    stillValidSelectedId ??
    (matches && matches.length === 1 ? matches[0].id : undefined);

  // Reset QR pagination whenever the selection changes.
  useEffect(() => {
    setCurrentQrIndex(0);
  }, [pollingPlaceId]);

  const urlsQuery = getLiveResultsReportingUrl.useQuery(
    pollingPlaceId ? { pollingPlaceId } : undefined
  );

  if (!matchesQuery.isSuccess) {
    return (
      <NavigationScreen
        title={TITLE}
        parentRoutes={reportParentRoutes}
        noPadding
      >
        <ReportScreenContainer>
          <FullPageMessage>
            <Loading />
          </FullPageMessage>
        </ReportScreenContainer>
      </NavigationScreen>
    );
  }

  if (matchesQuery.data.isErr()) {
    assert(matchesQuery.data.err() === 'no-cvrs-loaded');
    return (
      <NavigationScreen
        title={TITLE}
        parentRoutes={reportParentRoutes}
        noPadding
      >
        <ReportScreenContainer>
          <FullPageMessage>
            <Callout icon="Info" color="neutral">
              Load CVRs to send results.
            </Callout>
          </FullPageMessage>
        </ReportScreenContainer>
      </NavigationScreen>
    );
  }

  const pollingPlaces = matchesQuery.data.ok();

  if (pollingPlaces.length === 0) {
    return (
      <NavigationScreen
        title={TITLE}
        parentRoutes={reportParentRoutes}
        noPadding
      >
        <ReportScreenContainer>
          <FullPageMessage>
            <Callout icon="Warning" color="warning">
              No absentee polling place covers the precincts in the loaded CVRs.
            </Callout>
          </FullPageMessage>
        </ReportScreenContainer>
      </NavigationScreen>
    );
  }

  const showPicker = pollingPlaces.length > 1;
  const selectedPollingPlace = pollingPlaces.find(
    (p) => p.id === pollingPlaceId
  );
  const urls = urlsQuery.data;

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        {showPicker && (
          <SelectPollingPlaceContainer>
            <SearchSelect
              isMulti={false}
              isSearchable
              disabled={!!pollingPlaceId}
              value={pollingPlaceId}
              options={pollingPlaces.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              onChange={(value) => setSelectedPollingPlaceId(value)}
              aria-label="Select absentee polling place"
              style={{ width: '30rem' }}
              placeholder="Select an absentee polling place."
            />
          </SelectPollingPlaceContainer>
        )}
        <QrSection>
          {urlsQuery.isLoading && pollingPlaceId && (
            <P>Generating QR code...</P>
          )}
          {urlsQuery.isError && selectedPollingPlace && (
            <Callout icon="Danger" color="danger">
              Could not generate a QR code for {selectedPollingPlace.name}. The
              tally results may be too large to encode.
            </Callout>
          )}
          {urls && urls.length > 0 && selectedPollingPlace && (
            <div data-testid="live-results-code">
              <P>
                {urls.length === 1
                  ? `Scan the QR code to send the tally report for ${selectedPollingPlace.name}.`
                  : `Scan all ${urls.length} QR codes to send the tally report for ${selectedPollingPlace.name}.`}
              </P>
              <div data-value={urls[currentQrIndex]} style={{ width: '600px' }}>
                <QrCode value={urls[currentQrIndex]} size={600} />
              </div>
              {urls.length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '1rem',
                  }}
                >
                  <Button
                    onPress={() => setCurrentQrIndex((i) => Math.max(i - 1, 0))}
                    disabled={currentQrIndex === 0}
                  >
                    Previous
                  </Button>
                  <H6 style={{ margin: 0 }}>
                    {currentQrIndex + 1} / {urls.length}
                  </H6>
                  <Button
                    variant="primary"
                    onPress={() =>
                      setCurrentQrIndex((i) => Math.min(i + 1, urls.length - 1))
                    }
                    disabled={currentQrIndex >= urls.length - 1}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </QrSection>
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
