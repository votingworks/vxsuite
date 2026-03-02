import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import {
  Button,
  Card,
  H2,
  H3,
  Icons,
  Loading,
  Main,
  MainContent,
  MainHeader,
  P,
  Screen,
  SearchSelect,
  SegmentedButton,
  Table,
  TD,
} from '@votingworks/ui';
import type { CvrSource } from './cvr_source';
import {
  loadBallotList,
  loadFullCvr,
  loadImage,
  loadMachines,
} from './cvr_source';
import type {
  BallotEntry,
  CvrContest,
  Filter,
  FullCvrData,
  ImageSide,
  Machine,
} from './types';
import { DEFAULT_FILTER, passesFilter } from './types';
import { ScoreOverlay } from './score_overlay';
import { FilterPopup } from './filter_popup';
import { HelpOverlay } from './help_overlay';

const BrowserLayout = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0.5rem;
  padding: 0.5rem;
`;

const SidePanel = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const BallotsPanel = styled(SidePanel)`
  width: 35%;
`;

const PreviewPanel = styled(SidePanel)`
  width: 50%;
`;

const ScrollableList = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const PanelCard = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0.5rem;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  background: ${(p) => p.theme.colors.containerLow};
`;

const BallotRow = styled.tr<{ selected: boolean; dimmed: boolean }>`
  cursor: pointer;
  background: ${(p) =>
    p.selected ? p.theme.colors.primaryContainer : 'transparent'};
  opacity: ${(p) => (p.dimmed ? 0.5 : 1)};

  &:hover {
    background: ${(p) =>
      p.selected
        ? p.theme.colors.primaryContainer
        : p.theme.colors.containerLow};
  }
`;

const PreviewContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
  position: relative;
`;

const BallotImage = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
`;

const InterpretationContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
`;

const WriteInBadge = styled.span`
  font-size: 0.75rem;
  padding: 0 0.25rem;
  border-radius: 0.125rem;
  background: ${(p) => p.theme.colors.warningContainer};
`;

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const StatusText = styled.span`
  font-size: 0.875rem;
  color: ${(p) => p.theme.colors.onBackground};
  opacity: 0.6;
`;

type PreviewMode = 'image' | 'interpretation';

export function CvrBrowser({
  source,
  onBack,
}: {
  readonly source: CvrSource;
  readonly onBack: () => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const machines = useMemo(() => loadMachines(source), [source]);
  const [machineIndex, setMachineIndex] = useState(0);
  const [allBallots, setAllBallots] = useState<BallotEntry[]>([]);
  const [filteredBallots, setFilteredBallots] = useState<BallotEntry[]>([]);
  const [ballotIndex, setBallotIndex] = useState(0);
  const [currentCvr, setCurrentCvr] = useState<FullCvrData | null>(null);
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [backImageUrl, setBackImageUrl] = useState<string | null>(null);

  const [previewMode, setPreviewMode] = useState<PreviewMode>('image');
  const [imageSide, setImageSide] = useState<ImageSide>('front');
  const [showOverlay, setShowOverlay] = useState(false);
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [showFilter, setShowFilter] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableStyles = useMemo(() => {
    const styles = new Set<string>();
    for (const b of allBallots) {
      if (b.ballotStyle) {
        styles.add(b.ballotStyle);
      }
    }
    return Array.from(styles).sort();
  }, [allBallots]);

  const applyFilter = useCallback(
    (ballots: BallotEntry[], f: Filter) => {
      const filtered = ballots.filter((b) => passesFilter(b, f));
      setFilteredBallots(filtered);
      setBallotIndex(0);
      setCurrentCvr(null);
      setFrontImageUrl(null);
      setBackImageUrl(null);
    },
    []
  );

  const loadMachineBallots = useCallback(
    async (machine: Machine) => {
      try {
        const ballots = await loadBallotList(source, machine.path);
        setAllBallots(ballots);
        applyFilter(ballots, filter);
        setStatusMessage(`Loaded ${ballots.length} ballots`);
      } catch (e) {
        setStatusMessage(
          `Error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    [source, filter, applyFilter]
  );

  const loadBallot = useCallback(
    async (ballot: BallotEntry, side: ImageSide) => {
      setCurrentCvr(null);
      setFrontImageUrl(null);
      setBackImageUrl(null);

      if (!ballot.isRejected) {
        try {
          const cvr = await loadFullCvr(source, ballot.path, ballot.id);
          setCurrentCvr(cvr);
        } catch (e) {
          setStatusMessage(
            `CVR error: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      try {
        const url = await loadImage(source, ballot.path, ballot.id, side);
        if (side === 'front') {
          setFrontImageUrl(url);
        } else {
          setBackImageUrl(url);
        }
      } catch (e) {
        setStatusMessage(
          `Image error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    [source]
  );

  const scheduleBallotLoad = useCallback(
    (ballot: BallotEntry, side: ImageSide) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        void loadBallot(ballot, side);
      }, 150);
    },
    [loadBallot]
  );

  useEffect(() => {
    const firstMachine = machines[0];
    if (firstMachine) {
      void loadMachineBallots(firstMachine);
    }
  }, [machines]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load the first ballot when the filtered list changes
  useEffect(() => {
    const firstBallot = filteredBallots[0];
    if (firstBallot) {
      void loadBallot(firstBallot, imageSide);
    }
  }, [filteredBallots]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOtherSide = useCallback(
    async (ballot: BallotEntry, side: ImageSide) => {
      try {
        const url = await loadImage(source, ballot.path, ballot.id, side);
        if (side === 'front') {
          setFrontImageUrl(url);
        } else {
          setBackImageUrl(url);
        }
      } catch {
        // ignore
      }
    },
    [source]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showHelp) {
        setShowHelp(false);
        e.preventDefault();
        return;
      }

      if (showFilter) {
        return;
      }

      const { key } = e;
      const selectedBallot = filteredBallots[ballotIndex];

      switch (key) {
        case 'q':
        case 'Q':
          onBack();
          break;

        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setBallotIndex((prev) => {
            const next = Math.min(prev + 1, filteredBallots.length - 1);
            const ballot = filteredBallots[next];
            if (ballot) {
              scheduleBallotLoad(ballot, imageSide);
            }
            return next;
          });
          break;

        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setBallotIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            const ballot = filteredBallots[next];
            if (ballot) {
              scheduleBallotLoad(ballot, imageSide);
            }
            return next;
          });
          break;

        case 'g':
          e.preventDefault();
          setBallotIndex(0);
          if (filteredBallots[0]) {
            scheduleBallotLoad(filteredBallots[0], imageSide);
          }
          break;

        case 'G':
          e.preventDefault();
          {
            const last = filteredBallots.length - 1;
            setBallotIndex(Math.max(last, 0));
            if (filteredBallots[last]) {
              scheduleBallotLoad(filteredBallots[last], imageSide);
            }
          }
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (selectedBallot) {
            void loadBallot(selectedBallot, imageSide);
          }
          break;

        case 'f':
          e.preventDefault();
          setImageSide('front');
          setPreviewMode('image');
          if (selectedBallot && !frontImageUrl) {
            void loadOtherSide(selectedBallot, 'front');
          }
          break;

        case 'b':
          e.preventDefault();
          setImageSide('back');
          setPreviewMode('image');
          if (selectedBallot && !backImageUrl) {
            void loadOtherSide(selectedBallot, 'back');
          }
          break;

        case 'v':
          e.preventDefault();
          setPreviewMode((prev) =>
            prev === 'image' ? 'interpretation' : 'image'
          );
          break;

        case 'i':
          e.preventDefault();
          setShowOverlay((prev) => !prev);
          break;

        case '/':
          e.preventDefault();
          setShowFilter(true);
          break;

        case 'r':
          e.preventDefault();
          setFilter((prev) => {
            const next: Filter = { ...prev, showRejected: !prev.showRejected };
            applyFilter(allBallots, next);
            return next;
          });
          break;

        case '?':
          e.preventDefault();
          setShowHelp(true);
          break;

        case 'c':
          e.preventDefault();
          if (selectedBallot) {
            void navigator.clipboard.writeText(selectedBallot.id);
            setStatusMessage(`Copied: ${selectedBallot.id}`);
          }
          break;

        default:
          break;
      }
    },
    [
      showHelp,
      showFilter,
      filteredBallots,
      ballotIndex,
      imageSide,
      frontImageUrl,
      backImageUrl,
      allBallots,
      onBack,
      loadBallot,
      scheduleBallotLoad,
      loadOtherSide,
      applyFilter,
    ]
  );

  const handleFilterApply = useCallback(
    (newFilter: Filter) => {
      setFilter(newFilter);
      applyFilter(allBallots, newFilter);
      setShowFilter(false);
    },
    [allBallots, applyFilter]
  );

  const handleFilterCancel = useCallback(() => {
    setShowFilter(false);
  }, []);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const selectedBallot = filteredBallots[ballotIndex];
  const currentImageUrl =
    imageSide === 'front' ? frontImageUrl : backImageUrl;

  const previewContests: CvrContest[] = useMemo(() => {
    if (!currentCvr) return [];
    const pageNum = imageSide === 'front' ? 1 : 2;
    return currentCvr.contests.filter((c) => c.page === pageNum);
  }, [currentCvr, imageSide]);

  return (
    <Screen>
      <Main flexColumn>
        <MainHeader>
          <H2 style={{ margin: 0 }}>CVR Browser</H2>
          <ToolbarRow>
            <SearchSelect
              aria-label="Machine"
              options={machines.map((m) => ({ value: m.id, label: m.id }))}
              value={machines[machineIndex]?.id}
              onChange={(id) => {
                if (!id) return;
                const idx = machines.findIndex((m) => m.id === id);
                const machine = machines[idx];
                if (idx >= 0 && machine) {
                  setMachineIndex(idx);
                  void loadMachineBallots(machine);
                }
              }}
              style={{ minWidth: '14rem' }}
            />
            <Button
              icon="Search"
              onPress={() => setShowFilter(true)}
            >
              Filter
            </Button>
            <Button
              icon="Info"
              onPress={() => setShowHelp(true)}
            >
              Help
            </Button>
            <Button onPress={onBack}>Back</Button>
            {statusMessage && <StatusText>{statusMessage}</StatusText>}
          </ToolbarRow>
        </MainHeader>
        <MainContent
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={{ display: 'flex', flexDirection: 'column', padding: 0 }}
        >
          <BrowserLayout>
            <BallotsPanel>
              <PanelCard>
                <P style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>
                  Ballots ({filteredBallots.length}/{allBallots.length})
                </P>
                <ScrollableList>
                  <Table condensed>
                    <thead>
                      <tr>
                        <TD as="th" narrow>ID</TD>
                        <TD as="th" narrow>Style</TD>
                        <TD as="th" narrow nowrap>WI</TD>
                        <TD as="th" narrow nowrap textAlign="right">Score</TD>
                        <TD as="th" narrow>Status</TD>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBallots.map((ballot, idx) => {
                        const shortId =
                          ballot.id.length > 8
                            ? ballot.id.slice(0, 8)
                            : ballot.id;
                        return (
                          <BallotRow
                            key={ballot.id}
                            ref={idx === ballotIndex ? (el) => {
                              el?.scrollIntoView({ block: 'nearest' });
                            } : undefined}
                            selected={idx === ballotIndex}
                            dimmed={ballot.isRejected}
                            onClick={() => {
                              setBallotIndex(idx);
                              void loadBallot(ballot, imageSide);
                            }}
                          >
                            <TD narrow nowrap>
                              <code>{shortId}</code>
                            </TD>
                            <TD narrow nowrap>
                              {ballot.ballotStyle ?? '—'}
                            </TD>
                            <TD narrow nowrap>
                              {ballot.maxScore > 0.03 ? (
                                <WriteInBadge>WI</WriteInBadge>
                              ) : null}
                            </TD>
                            <TD narrow nowrap textAlign="right">
                              {ballot.maxScore.toFixed(2)}
                            </TD>
                            <TD narrow nowrap>
                              {ballot.isRejected ? (
                                <Icons.Warning
                                  color="warning"
                                />
                              ) : null}
                            </TD>
                          </BallotRow>
                        );
                      })}
                    </tbody>
                  </Table>
                  {filteredBallots.length === 0 && (
                    <P style={{ textAlign: 'center', opacity: 0.6 }}>
                      {allBallots.length === 0
                        ? 'Select a machine'
                        : 'No ballots match filter'}
                    </P>
                  )}
                </ScrollableList>
              </PanelCard>
            </BallotsPanel>

            <PreviewPanel>
              <PanelCard>
                <ToolbarRow style={{ marginBottom: '0.5rem' }}>
                  <SegmentedButton
                    label="View mode"
                    hideLabel
                    options={[
                      { id: 'image' as PreviewMode, label: 'Image' },
                      {
                        id: 'interpretation' as PreviewMode,
                        label: 'Interpretation',
                      },
                    ]}
                    selectedOptionId={previewMode}
                    onChange={setPreviewMode}
                  />
                  {previewMode === 'image' && (
                    <React.Fragment>
                      <SegmentedButton
                        label="Ballot side"
                        hideLabel
                        options={[
                          { id: 'front' as ImageSide, label: 'Front' },
                          { id: 'back' as ImageSide, label: 'Back' },
                        ]}
                        selectedOptionId={imageSide}
                        onChange={(side) => {
                          setImageSide(side);
                          if (selectedBallot) {
                            const hasImage =
                              side === 'front'
                                ? frontImageUrl
                                : backImageUrl;
                            if (!hasImage) {
                              void loadOtherSide(selectedBallot, side);
                            }
                          }
                        }}
                      />
                      <Button
                        variant={showOverlay ? 'primary' : 'neutral'}
                        onPress={() => setShowOverlay((prev) => !prev)}
                      >
                        Overlay
                      </Button>
                    </React.Fragment>
                  )}
                  {selectedBallot && (
                    <Button
                      variant="neutral"
                      onPress={() => {
                        void navigator.clipboard.writeText(selectedBallot.id);
                        setStatusMessage(`Copied: ${selectedBallot.id}`);
                      }}
                    >
                      Copy ID
                    </Button>
                  )}
                </ToolbarRow>

                {previewMode === 'image' ? (
                  <PreviewContainer>
                    {currentImageUrl ? (
                      <React.Fragment>
                        <BallotImage src={currentImageUrl} alt="Ballot" />
                        {showOverlay && (
                          <ScoreOverlay
                            imageUrl={currentImageUrl}
                            contests={previewContests}
                          />
                        )}
                      </React.Fragment>
                    ) : selectedBallot ? (
                      <Loading>Loading image</Loading>
                    ) : (
                      <P style={{ opacity: 0.6 }}>
                        Select a ballot to view
                      </P>
                    )}
                  </PreviewContainer>
                ) : (
                  <InterpretationContainer>
                    {currentCvr ? (
                      <React.Fragment>
                        <P>
                          <strong>Ballot style:</strong>{' '}
                          {currentCvr.ballotStyle}
                        </P>
                        {currentCvr.contests.map((contest) => (
                          <ContestCard
                            key={`${contest.id}-${contest.page}`}
                            contest={contest}
                          />
                        ))}
                      </React.Fragment>
                    ) : (
                      <P style={{ opacity: 0.6 }}>
                        No CVR data (rejected or not loaded)
                      </P>
                    )}
                  </InterpretationContainer>
                )}
              </PanelCard>
            </PreviewPanel>
          </BrowserLayout>
        </MainContent>
      </Main>

      {showFilter && (
        <FilterPopup
          filter={filter}
          availableStyles={availableStyles}
          onApply={handleFilterApply}
          onCancel={handleFilterCancel}
        />
      )}

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </Screen>
  );
}

const OptionRow = styled.tr<{ hasIndication: boolean }>`
  opacity: ${(p) => (p.hasIndication ? 1 : 0.5)};
`;

function ContestCard({
  contest,
}: {
  readonly contest: CvrContest;
}): JSX.Element {
  const pageLabel = contest.page === 2 ? ' (page 2)' : '';
  return (
    <Card style={{ marginBottom: '0.5rem', padding: '0.5rem' }}>
      <H3 style={{ margin: '0 0 0.25rem', fontSize: '0.875rem' }}>
        {contest.id}
        {pageLabel}
      </H3>
      <Table condensed>
        <thead>
          <tr>
            <TD as="th" narrow />
            <TD as="th">Option</TD>
            <TD as="th" narrow textAlign="right">
              Score
            </TD>
          </tr>
        </thead>
        <tbody>
          {contest.options.map((opt) => (
            <OptionRow key={opt.name} hasIndication={opt.hasIndication}>
              <TD narrow>
                {opt.hasIndication ? <Icons.Checkbox /> : null}
              </TD>
              <TD>
                {opt.name}
                {opt.isWriteIn ? (
                  <WriteInBadge style={{ marginLeft: '0.25rem' }}>
                    write-in
                  </WriteInBadge>
                ) : null}
              </TD>
              <TD narrow textAlign="right">
                {opt.score.toFixed(2)}
              </TD>
            </OptionRow>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
