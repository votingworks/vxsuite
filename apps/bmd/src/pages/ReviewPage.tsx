import pluralize from 'pluralize'
import React, { PointerEventHandler } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'
import {
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  CandidateContest,
  YesNoContest,
  Contests,
  Parties,
} from '@votingworks/ballot-encoder'

import { findPartyById } from '../utils/find'
import { Scrollable, ScrollDirections, ScrollShadows } from '../config/types'

import Button, { DecoyButton } from '../components/Button'
import LinkButton from '../components/LinkButton'
import Main from '../components/Main'
import Prose from '../components/Prose'
import Text, { NoWrap } from '../components/Text'
import { FONT_SIZES, YES_NO_VOTES } from '../config/globals'
import BallotContext from '../contexts/ballotContext'
import Screen from '../components/Screen'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import SettingsTextSize from '../components/SettingsTextSize'

const ContentHeader = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 1rem 5rem 0.5rem 3rem;
`
const ContestSection = styled.div`
  text-transform: uppercase;
  font-size: 0.85rem;
  font-weight: 600;
`
const VariableContentContainer = styled.div<ScrollShadows>`
  display: flex;
  flex: 1;
  position: relative;
  overflow: auto;
  &::before,
  &::after {
    position: absolute;
    z-index: 1;
    width: 100%;
    height: 0.25rem;
    content: '';
    transition: opacity 0.25s ease;
  }
  &::before {
    top: 0;
    opacity: ${({ showTopShadow }) =>
      showTopShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      rgb(177, 186, 190) 0%,
      transparent 100%
    );
  }
  &::after {
    bottom: 0;
    opacity: ${({ showBottomShadow }) =>
      showBottomShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgb(177, 186, 190) 100%
    );
  }
`
const ScrollControls = styled.div`
  z-index: 2;
  & > button {
    position: absolute;
    right: 1.5rem;
    transform: opacity 1s linear;
    visibility: visible;
    opacity: 1;
    outline: none;
    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.3);
    width: 8rem;
    height: 5rem;
    padding: 0;
    font-weight: 700;
    transition: visibility 0s linear 0s, opacity 500ms;
    &[disabled] {
      visibility: hidden;
      opacity: 0;
      transition: visibility 0s linear 500ms, opacity 500ms;
      pointer-events: none;
    }
    & > span {
      position: relative;
      pointer-events: none;
    }
    &::before {
      position: absolute;
      left: 50%;
      margin-left: -1rem;
      width: 2rem;
      height: 2rem;
      content: '';
    }
    &:first-child {
      top: 0;
      border-radius: 0 0 4rem 4rem;
      & > span {
        top: -1.25rem;
      }
      &::before {
        bottom: 0.75rem;
        background: url('/images/arrow-up.svg') no-repeat;
      }
    }
    &:last-child {
      bottom: 0;
      border-radius: 4rem 4rem 0 0;
      & > span {
        top: 1.25rem;
      }
      &::before {
        top: 0.75rem;
        background: url('/images/arrow-down.svg') no-repeat;
      }
    }
  }
`
const ScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
`
const ScrollableContentWrapper = styled.div<Scrollable>`
  margin: 0 auto;
  width: 100%;
  padding: 0.5rem 5rem 2rem 3rem;
  padding-right: ${({ isScrollable }) =>
    isScrollable
      ? /* istanbul ignore next: Tested by Cypress */ '11rem'
      : undefined};
`

const Contest = styled(LinkButton)`
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  border-radius: 0.125rem;
  box-shadow: 0 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.14),
    0 0.1875rem 0.0625rem -0.125rem rgba(0, 0, 0, 0.12),
    0 0.0625rem 0.3125rem 0 rgba(0, 0, 0, 0.2);
  background: #ffffff;
  width: 100%; /* reset Button default here at component rather than pass 'fullWidth' param. */
  padding: 0.375rem 0.5rem;
  text-decoration: inherit;
  white-space: normal; /* reset Button default */
  color: inherit;
  button& {
    cursor: pointer;
    text-align: left;
  }
  &:last-child {
    margin-bottom: 0;
  }
  @media (min-width: 480px) {
    padding: 0.75rem 1rem;
  }
`
const ContestProse = styled(Prose)`
  flex: 1;
  & > h3 {
    font-weight: 400;
  }
`
const ContestActions = styled.div`
  display: none;
  padding-left: 1rem;
  @media (min-width: 480px) {
    display: block;
  }
`
const NoSelection = () => (
  <Text
    aria-label="You may still vote in this contest."
    bold
    warning
    warningIcon
    wordBreak
  >
    You may still vote in this contest.
  </Text>
)

const CandidateContestResult = ({
  contest,
  parties,
  vote = [],
}: {
  contest: CandidateContest
  parties: Parties
  vote: CandidateVote
}) => {
  const remainingChoices = contest.seats - vote.length
  return vote === undefined || vote.length === 0 ? (
    <NoSelection />
  ) : (
    <React.Fragment>
      {vote.map((candidate, index, array) => {
        const party =
          candidate.partyId && findPartyById(parties, candidate.partyId)
        return (
          <Text
            key={candidate.id}
            aria-label={`${candidate.name}${party ? `, ${party.name}` : ''}${
              candidate.isWriteIn ? ', write-in' : ''
            }${array.length - 1 === index ? '.' : ','}`}
            wordBreak
            voteIcon
          >
            <strong>{candidate.name}</strong> {party && `/ ${party.name}`}
            {candidate.isWriteIn && '(write-in)'}
          </Text>
        )
      })}
      {!!remainingChoices && (
        <Text bold warning warningIcon wordBreak>
          You may still vote for {remainingChoices} more{' '}
          {pluralize('candidate', remainingChoices)}.
        </Text>
      )}
    </React.Fragment>
  )
}

const YesNoContestResult = (props: {
  contest: YesNoContest
  vote: OptionalYesNoVote
}) =>
  props.vote ? (
    <Text bold wordBreak voteIcon>
      {YES_NO_VOTES[props.vote]}{' '}
      {!!props.contest.shortTitle && `on ${props.contest.shortTitle}`}
    </Text>
  ) : (
    <NoSelection />
  )

const SidebarSpacer = styled.div`
  height: 90px;
`
interface State {
  isScrollAtBottom: boolean
  isScrollAtTop: boolean
  isScrollable: boolean
}

const initialState: State = {
  isScrollable: false,
  isScrollAtBottom: true,
  isScrollAtTop: true,
}

class ReviewPage extends React.Component<RouteComponentProps, State> {
  public context!: React.ContextType<typeof BallotContext>
  public state: State = initialState
  private scrollContainer = React.createRef<HTMLDivElement>()

  public componentDidMount = () => {
    this.updateContestChoicesScrollStates()
    window.addEventListener('resize', this.updateContestChoicesScrollStates)
    const targetElement =
      window.location.hash && document.querySelector(window.location.hash)
    /* istanbul ignore next: Tested by Cypress */
    if (targetElement && !navigator.userAgent.includes('jsdom')) {
      targetElement.scrollIntoView({ block: 'center' })
      window.setTimeout(() => (targetElement as HTMLDivElement).focus(), 1)
    }
  }

  public updateContestChoicesScrollStates = () => {
    const target = this.scrollContainer.current
    /* istanbul ignore next - `target` should aways exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return
    }
    const targetMinHeight = FONT_SIZES[this.context.userSettings.textSize] * 8 // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1 // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop) // Windows Chrome scrolls to sub-pixel values.
    this.setState({
      isScrollable:
        /* istanbul ignore next: Tested by Cypress */
        target.scrollHeight > target.offsetHeight &&
        /* istanbul ignore next: Tested by Cypress */
        target.offsetHeight > targetMinHeight,
      isScrollAtBottom:
        windowsScrollTop +
          target.offsetHeight +
          windowsScrollTopOffsetMagicNumber >= // Windows Chrome "gte" check.
        target.scrollHeight,
      isScrollAtTop: target.scrollTop === 0,
    })
  }

  public scrollContestChoices: PointerEventHandler = /* istanbul ignore next: Tested by Cypress */ event => {
    const direction = (event.target as HTMLElement).dataset
      .direction as ScrollDirections
    const scrollContainer = this.scrollContainer.current!
    const currentScrollTop = scrollContainer.scrollTop
    const offsetHeight = scrollContainer.offsetHeight
    const scrollHeight = scrollContainer.scrollHeight
    const idealScrollDistance = Math.round(offsetHeight * 0.75)
    const maxScrollableDownDistance =
      scrollHeight - offsetHeight - currentScrollTop
    const maxScrollTop =
      direction === 'down'
        ? currentScrollTop + maxScrollableDownDistance
        : currentScrollTop
    const idealScrollTop =
      direction === 'down'
        ? currentScrollTop + idealScrollDistance
        : currentScrollTop - idealScrollDistance
    const top = idealScrollTop > maxScrollTop ? maxScrollTop : idealScrollTop
    scrollContainer.scrollTo({ behavior: 'smooth', left: 0, top })
  }

  public static contextType = BallotContext

  public render() {
    const {
      appMode,
      contests,
      election,
      precinctId,
      votes,
      userSettings,
      setUserSettings,
    } = this.context
    const { parties } = election
    const { isScrollable, isScrollAtBottom, isScrollAtTop } = this.state

    return (
      <Screen>
        <Main>
          <ContentHeader>
            <Prose id="audiofocus">
              <h1>
                <span aria-label="Review Your Votes.">Review Your Votes</span>
                <span className="screen-reader-only">
                  To review your votes, advance through the ballot contests
                  using the up and down buttons. To change your vote in any
                  contest, use the select button to navigate to that contest.
                  When you are finished making your ballot selections and ready
                  to print your ballot, use the right button to continue.
                </span>
              </h1>
            </Prose>
          </ContentHeader>
          <VariableContentContainer
            showTopShadow={!isScrollAtTop}
            showBottomShadow={!isScrollAtBottom}
          >
            <ScrollContainer
              ref={this.scrollContainer}
              onScroll={this.updateContestChoicesScrollStates}
            >
              <ScrollableContentWrapper isScrollable={isScrollable}>
                {(contests as Contests).map((contest, i) => (
                  <Contest
                    id={`contest-${contest.id}`}
                    key={contest.id}
                    to={`/contests/${i}#review`}
                  >
                    <ContestProse compact>
                      <h2 aria-label={`${contest.title.replace(',', '')},`}>
                        <ContestSection>{contest.section}</ContestSection>
                        {contest.title}
                      </h2>

                      {contest.type === 'candidate' && (
                        <CandidateContestResult
                          contest={contest}
                          parties={parties}
                          vote={votes[contest.id] as CandidateVote}
                        />
                      )}
                      {contest.type === 'yesno' && (
                        <YesNoContestResult
                          contest={contest}
                          vote={votes[contest.id] as YesNoVote}
                        />
                      )}
                    </ContestProse>
                    <ContestActions aria-label="press enter to change your answer for this contest.">
                      <DecoyButton primary aria-hidden>
                        Change
                      </DecoyButton>
                    </ContestActions>
                  </Contest>
                ))}
              </ScrollableContentWrapper>
            </ScrollContainer>
            {isScrollable /* istanbul ignore next: Tested by Cypress */ && (
              <ScrollControls aria-hidden>
                <Button
                  className="scroll-up"
                  big
                  primary
                  aria-hidden
                  data-direction="up"
                  disabled={isScrollAtTop}
                  onPress={this.scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
                <Button
                  className="scroll-down"
                  big
                  primary
                  aria-hidden
                  data-direction="down"
                  disabled={isScrollAtBottom}
                  onPress={this.scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
              </ScrollControls>
            )}
          </VariableContentContainer>
        </Main>
        <Sidebar
          footer={
            <React.Fragment>
              <SettingsTextSize
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
              <ElectionInfo
                election={election}
                precinctId={precinctId}
                horizontal
              />
            </React.Fragment>
          }
        >
          <SidebarSpacer />
          <Prose>
            <h2 aria-hidden>Review Votes</h2>
            <p>Confirm your votes are correct.</p>
            <p>
              <LinkButton
                big
                primary
                to={appMode.isVxPrint ? '/print' : '/save'}
                id="next"
              >
                I’m Ready to <NoWrap>Print My Ballot</NoWrap>
              </LinkButton>
            </p>
          </Prose>
        </Sidebar>
      </Screen>
    )
  }
}

export default ReviewPage
