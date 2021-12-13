import { assert } from '@votingworks/utils';
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import {
  BallotLocale,
  getBallotStyle,
  getContests,
  getPrecinctById,
  getElectionLocales,
} from '@votingworks/types';
import pluralize from 'pluralize';

import { LogEventId } from '@votingworks/logging';
import {
  BallotScreenProps,
  InputEventFunction,
  PrintableBallotType,
} from '../config/types';
import { AppContext } from '../contexts/app_context';

import { Button, SegmentedButton } from '../components/button';
import { PrintButton } from '../components/print_button';
import { HandMarkedPaperBallot } from '../components/hand_marked_paper_ballot';
import { Monospace } from '../components/text';
import { getBallotPath, getHumanBallotLanguageFormat } from '../utils/election';
import { NavigationScreen } from '../components/navigation_screen';
import { DEFAULT_LOCALE } from '../config/globals';
import { routerPaths } from '../router_paths';
import { TextInput } from '../components/text_input';
import { LinkButton } from '../components/link_button';
import { Prose } from '../components/prose';
import { getBallotLayoutPageSize } from '../utils/get_ballot_layout_page_size';
import { generateFileContentToSaveAsPdf } from '../utils/save_as_pdf';
import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';

const BallotCopiesInput = styled(TextInput)`
  width: 4em;
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    opacity: 1;
  }
`;

const BallotPreviewHeader = styled.div`
  margin-top: 1rem;
  overflow: auto;
  h4 {
    float: left;
    margin: 0;
    width: 8.5in;
    &:first-child {
      margin-right: 1rem;
    }
  }
`;

const BallotPreview = styled.div`
  border-width: 1px 0;
  overflow: auto;
  /* stylelint-disable-next-line selector-class-pattern */
  & .pagedjs_page {
    float: left;
    margin: 1rem 1rem 0 0;
    background: #ffffff;
    &:nth-child(odd) {
      clear: left;
    }
  }
`;

export function BallotScreen(): JSX.Element {
  const history = useHistory();
  const ballotPreviewRef = useRef<HTMLDivElement>(null);
  const {
    precinctId,
    ballotStyleId,
    localeCode: currentLocaleCode,
  } = useParams<BallotScreenProps>();
  const {
    addPrintedBallot,
    electionDefinition,
    printBallotRef,
    logger,
    currentUserSession,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election, electionHash } = electionDefinition;
  const availableLocaleCodes = getElectionLocales(election, DEFAULT_LOCALE);
  const locales = useMemo<BallotLocale>(
    () => ({
      primary: DEFAULT_LOCALE,
      secondary: currentLocaleCode,
    }),
    [currentLocaleCode]
  );

  const precinctName = getPrecinctById({ election, precinctId })?.name;
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  const ballotContests = getContests({ ballotStyle, election });

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [ballotPages, setBallotPages] = useState(0);
  const [isSampleBallot, setIsSampleBallot] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);
  function updateSetIsLiveMode(mode: boolean) {
    setIsLiveMode(mode);
    setIsSampleBallot(false);
  }
  const [isAbsentee, setIsAbsentee] = useState(true);
  function toggleIsAbsentee() {
    return setIsAbsentee((m) => !m);
  }
  const [ballotCopies, setBallotCopies] = useState(1);
  const updateBallotCopies: InputEventFunction = (event) => {
    const { value } = event.currentTarget;
    // eslint-disable-next-line vx/gts-safe-number-parse
    const copies = value ? parseInt(value, 10) : 1;
    setBallotCopies(copies < 1 ? 1 : copies);
  };
  function changeLocale(localeCode: string) {
    return history.replace(
      localeCode === DEFAULT_LOCALE
        ? routerPaths.ballotsView({ precinctId, ballotStyleId })
        : routerPaths.ballotsViewLanguage({
            precinctId,
            ballotStyleId,
            localeCode,
          })
    );
  }

  const filename = getBallotPath({
    ballotStyleId,
    election,
    electionHash,
    precinctId,
    locales,
    isLiveMode,
    isAbsentee,
  });

  function afterPrint(numCopies: number) {
    assert(currentUserSession); // TODO(auth) check permissions for viewing ballots
    const type = isAbsentee
      ? PrintableBallotType.Absentee
      : PrintableBallotType.Precinct;
    if (isLiveMode) {
      addPrintedBallot({
        ballotStyleId,
        precinctId,
        locales,
        numCopies,
        printedAt: new Date().toISOString(),
        type,
      });
    }
    void logger.log(LogEventId.BallotPrinted, currentUserSession.type, {
      message: `${numCopies} ${
        isLiveMode ? 'Live mode' : 'Test mode'
      } ${type} ballots printed. Precinct: ${precinctId}, ballot style: ${ballotStyleId}`,
      disposition: 'success',
      isLiveMode,
      ballotStyleId,
      precinctId,
      locales: getHumanBallotLanguageFormat(locales),
      numCopies,
      type,
    });
  }

  function afterPrintError(errorMessage: string) {
    assert(currentUserSession); // TODO(auth) check permissions for viewing ballots
    void logger.log(LogEventId.BallotPrinted, currentUserSession.type, {
      message: `Error attempting to print ballot: ${errorMessage}`,
      disposition: 'failure',
    });
  }

  const onRendered = useCallback(() => {
    if (ballotPreviewRef?.current && printBallotRef?.current) {
      ballotPreviewRef.current.innerHTML = printBallotRef.current.innerHTML;
    }
    // eslint-disable-next-line vx/gts-safe-number-parse
    const pagedJsPageCount = Number(
      (ballotPreviewRef.current?.getElementsByClassName(
        'pagedjs_pages'
      )[0] as HTMLElement)?.style.getPropertyValue('--pagedjs-page-count') || 0
    );
    setBallotPages(pagedJsPageCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ballotPreviewRef]);

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>
            Ballot Style <strong>{ballotStyleId}</strong> for {precinctName} has{' '}
            <strong>{pluralize('contest', ballotContests.length, true)}</strong>
          </h1>
          <p>
            <SegmentedButton>
              <Button
                disabled={isLiveMode && !isSampleBallot}
                onPress={() => updateSetIsLiveMode(true)}
                small
              >
                Official
              </Button>
              <Button
                disabled={!isLiveMode && !isSampleBallot}
                onPress={() => updateSetIsLiveMode(false)}
                small
              >
                Test
              </Button>
              <Button
                disabled={isSampleBallot}
                onPress={() => setIsSampleBallot(true)}
                small
              >
                Sample
              </Button>
            </SegmentedButton>{' '}
            <SegmentedButton>
              <Button disabled={isAbsentee} onPress={toggleIsAbsentee} small>
                Absentee
              </Button>
              <Button disabled={!isAbsentee} onPress={toggleIsAbsentee} small>
                Precinct
              </Button>
            </SegmentedButton>{' '}
            Copies{' '}
            <BallotCopiesInput
              name="copies"
              defaultValue={ballotCopies}
              type="number"
              min={1}
              step={1}
              pattern="\d*"
              onChange={updateBallotCopies}
            />
            {availableLocaleCodes.length > 1 && (
              <React.Fragment>
                {' '}
                <SegmentedButton>
                  {availableLocaleCodes.map((localeCode) => (
                    <Button
                      disabled={
                        currentLocaleCode
                          ? localeCode === currentLocaleCode
                          : localeCode === DEFAULT_LOCALE
                      }
                      key={localeCode}
                      onPress={() => changeLocale(localeCode)}
                      small
                    >
                      {getHumanBallotLanguageFormat({
                        primary: DEFAULT_LOCALE,
                        secondary:
                          localeCode === DEFAULT_LOCALE
                            ? undefined
                            : localeCode,
                      })}
                    </Button>
                  ))}
                </SegmentedButton>
              </React.Fragment>
            )}
          </p>
          <p>
            <PrintButton
              primary
              title={filename}
              afterPrint={() => afterPrint(ballotCopies)}
              afterPrintError={afterPrintError}
              confirmModal={{
                content: (
                  <div>
                    Is the printer loaded with{' '}
                    <strong>
                      {isAbsentee ? 'Absentee' : 'Precinct'} Ballot
                    </strong>{' '}
                    paper?
                  </div>
                ),
                confirmButtonLabel: 'Yes, Print',
              }}
              copies={ballotCopies}
              sides="two-sided-long-edge"
              warning={!isLiveMode || isSampleBallot}
            >
              Print {ballotCopies}{' '}
              {isSampleBallot ? (
                <strong>Sample</strong>
              ) : isLiveMode ? (
                'Official'
              ) : (
                <strong>Test</strong>
              )}{' '}
              {isAbsentee ? <strong>Absentee</strong> : 'Precinct'}{' '}
              {pluralize('Ballot', ballotCopies)}{' '}
              {availableLocaleCodes.length > 1 &&
                currentLocaleCode &&
                ` in ${getHumanBallotLanguageFormat(locales)}`}
            </PrintButton>
            {window.kiosk && (
              <React.Fragment>
                {' '}
                <Button
                  onPress={() => setIsSaveModalOpen(true)}
                  disabled={ballotPages === 0}
                >
                  Save Ballot as PDF
                </Button>
              </React.Fragment>
            )}
          </p>
          <p>
            <LinkButton small to={routerPaths.ballotsList}>
              Back to List Ballots
            </LinkButton>
          </p>
          <p>
            Ballot Package Filename: <Monospace>{filename}</Monospace>
          </p>
          <h3>Ballot Preview</h3>
          {ballotPages > 0 && (
            <p>
              This ballot is <strong>{ballotPages} pages</strong> (printed front
              and back) on{' '}
              <strong>{pluralize('sheets', ballotPages / 2, true)}</strong> of{' '}
              <strong>{getBallotLayoutPageSize(election)}-size</strong> paper.
            </p>
          )}
        </Prose>
        <BallotPreviewHeader>
          <h4>Front Pages</h4>
          <h4>Back Pages</h4>
        </BallotPreviewHeader>
        <BallotPreview ref={ballotPreviewRef}>
          <p>Rendering ballot preview…</p>
        </BallotPreview>
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={generateFileContentToSaveAsPdf}
          defaultFilename={filename}
          fileType={FileType.Ballot}
        />
      )}
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        electionHash={electionHash}
        isSampleBallot={isSampleBallot}
        isLiveMode={isLiveMode}
        isAbsentee={isAbsentee}
        precinctId={precinctId}
        locales={locales}
        onRendered={onRendered}
      />
    </React.Fragment>
  );
}
