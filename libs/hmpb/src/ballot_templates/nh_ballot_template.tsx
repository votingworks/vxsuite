import { assertDefined } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  BallotStyleId,
  BallotType,
  Election,
  ElectionDefinition,
  ElectionSerializationFormat,
  ballotPaperDimensions,
  getBallotStyle,
  getPartyForBallotStyle,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  electionStrings,
} from '@votingworks/ui';
import {
  BallotPageTemplate,
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
} from '../render_ballot';
import { Renderer } from '../renderer';
import { Page, TimingMarkGrid, pageMarginsInches } from '../ballot_components';
import { BallotMode } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import {
  BallotPageContent,
  DualLanguageText,
  Footer,
  Instructions,
  primaryLanguageCode,
} from './vx_default_ballot_template';

export interface NhPrecinctSplitOptions {
  electionTitleOverride?: string;
  clerkSignatureImage?: string;
  clerkSignatureCaption?: string;
}

function Header({
  election,
  ballotStyleId,
  ballotType,
  ballotMode,

  electionTitleOverride,
  clerkSignatureImage,
  clerkSignatureCaption,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
} & NhPrecinctSplitOptions) {
  const ballotTitles: Record<BallotMode, Record<BallotType, JSX.Element>> = {
    official: {
      [BallotType.Precinct]: hmpbStrings.hmpbOfficialBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbOfficialAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbOfficialProvisionalBallot,
    },
    sample: {
      [BallotType.Precinct]: hmpbStrings.hmpbSampleBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbSampleAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbSampleProvisionalBallot,
    },
    test: {
      [BallotType.Precinct]: hmpbStrings.hmpbTestBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbTestAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbTestProvisionalBallot,
    },
  };
  const ballotTitle = ballotTitles[ballotMode][ballotType];

  const party =
    election.type === 'primary'
      ? assertDefined(getPartyForBallotStyle({ election, ballotStyleId }))
      : undefined;

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          height: '5rem',
          aspectRatio: '1 / 1',
          backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
            election.seal
          ).toString('base64')})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          marginTop: '0.125rem',
        }}
      />
      <div style={{ flexGrow: 2 }}>
        <DualLanguageText>
          <div>
            <h1>{ballotTitle}</h1>
            {party && <h1>{electionStrings.partyFullName(party)}</h1>}
            <h2>
              {electionTitleOverride ?? electionStrings.electionTitle(election)}
            </h2>
            <h2>{electionStrings.electionDate(election)}</h2>
            <div>
              {/* TODO comma-delimiting the components of a location doesn't
            necessarily work in all languages. We need to figure out a
            language-aware way to denote hierarchical locations. */}
              {electionStrings.countyName(election.county)},{' '}
              {electionStrings.stateName(election)}
            </div>
          </div>
        </DualLanguageText>
      </div>
      <div style={{ flexGrow: 1 }}>
        {clerkSignatureImage && (
          <div
            style={{
              height: '3rem',
              backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
                clerkSignatureImage
              ).toString('base64')})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              marginTop: '0.125rem',
            }}
          />
        )}
        {clerkSignatureCaption && <div>{clerkSignatureCaption}</div>}
      </div>
    </div>
  );
}

// Almost identical to vx_default_ballot_template BallotPageFrame except additional props are passed to Header.
function BallotPageFrame({
  election,
  ballotStyleId,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  electionTitleOverride,
  clerkSignatureImage,
  clerkSignatureCaption,
}: BaseBallotProps &
  NhPrecinctSplitOptions & {
    pageNumber: number;
    totalPages: number;
    children: JSX.Element;
  }): JSX.Element {
  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const languageCode = primaryLanguageCode(ballotStyle);
  return (
    <BackendLanguageContextProvider
      key={pageNumber}
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={election.ballotStrings}
    >
      <Page
        pageNumber={pageNumber}
        dimensions={pageDimensions}
        margins={pageMarginsInches}
      >
        <TimingMarkGrid pageDimensions={pageDimensions}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              padding: '0.125in',
            }}
          >
            {pageNumber === 1 && (
              <>
                <Header
                  election={election}
                  ballotStyleId={ballotStyleId}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  electionTitleOverride={electionTitleOverride}
                  clerkSignatureImage={clerkSignatureImage}
                  clerkSignatureCaption={clerkSignatureCaption}
                />
                <Instructions languageCode={languageCode} />
              </>
            )}
            <div
              style={{
                flex: 1,
                // Prevent this flex item from overflowing its container
                // https://stackoverflow.com/a/66689926
                minHeight: 0,
              }}
            >
              {children}
            </div>
            <Footer
              election={election}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              pageNumber={pageNumber}
              totalPages={totalPages}
            />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

export const nhBallotTemplate: BallotPageTemplate<BaseBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};

/**
 * Helper function that renders ballots and generates an election definition for a
 * New Hampshire hmpb ballot layout.
 */
export async function createElectionDefinitionForNhHmpbTemplate(
  renderer: Renderer,
  election: Election,
  electionSerializationFormat: ElectionSerializationFormat
): Promise<ElectionDefinition> {
  const { electionDefinition } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      nhBallotTemplate,
      // Each ballot style will have exactly one grid layout regardless of precinct, ballot type, or ballot mode
      // So we just need to render a single ballot per ballot style to create the election definition
      election.ballotStyles.map((ballotStyle) => ({
        election,
        ballotStyleId: ballotStyle.id,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        precinctId: ballotStyle.precincts[0]!,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })),
      electionSerializationFormat
    );
  return electionDefinition;
}
