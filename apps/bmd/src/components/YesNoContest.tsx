import React from 'react'
import styled from 'styled-components'

import {
  ButtonEvent,
  InputEvent,
  OptionalYesNoVote,
  Scrollable,
  ScrollDirections,
  ScrollShadows,
  UpdateVoteFunction,
  YesNoContest as YesNoContestInterface,
  YesNoVote,
} from '../config/types'

import BallotContext from '../contexts/ballotContext'

import GLOBALS from '../config/globals'
import Button from './Button'
import Main from './Main'
import Modal from './Modal'
import Prose from './Prose'
import Text, { TextWithLineBreaks } from './Text'

const tabletMinWidth = 720
const votes = GLOBALS.YES_NO_VOTES

const ContentHeader = styled.div`
  width: 100%;
  max-width: 35rem;
  margin: 0px auto;
  padding: 1rem 0.75rem 0.5rem;
  @media (min-width: ${tabletMinWidth}px) {
    padding: 1rem 1.5rem 0.5rem;
    padding-left: 5rem;
  }
`
const ContestSection = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
`
const ContestDescription = styled.div`
  padding: 0 0.25rem;
  @media (min-width: ${tabletMinWidth}px) {
    padding-left: 4rem;
  }
`
const ContestFooter = styled.div`
  width: 100%;
  max-width: 35rem;
  margin: 0 auto;
  padding: 1rem 0.5rem;
  @media (min-width: ${tabletMinWidth}px) {
    padding-right: 1rem;
    padding-left: 1rem;
  }
`
const VariableContentContainer = styled.div<ScrollShadows>`
  display: flex;
  flex: 1;
  position: relative;
  overflow: auto;
  &:before,
  &:after {
    content: '';
    z-index: 1;
    transition: opacity 0.25s ease;
    position: absolute;
    height: 0.25rem;
    width: 100%;
  }
  &:before {
    top: 0;
    opacity: ${({ showTopShadow }) =>
      showTopShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      rgb(177, 186, 190) 0%,
      transparent 100%
    );
  }
  &:after {
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
  display: none;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  max-width: 35rem;
  padding: 0.5rem 0.75rem 0.5rem 0;
  padding-left: calc(100% - 7rem);
  pointer-events: none;
  & > * {
    pointer-events: auto;
  }
  html[data-useragent*='Windows'] & {
    margin-left: -17px; /* Windows Chrome scrollbar width */
  }
  @media (min-width: ${tabletMinWidth}px) {
    display: flex;
  }
  @media (min-width: 840px) {
    left: 50%;
    margin-left: -420px;
    padding-left: calc(840px - 7rem);
    html[data-useragent*='Windows'] & {
      margin-left: calc(-420px + -17px); /* Windows Chrome scrollbar width */
    }
  }
`
const ScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
`
const ScrollableContentWrapper = styled.div<Scrollable>`
  width: 100%;
  max-width: 35rem;
  margin: 0 auto;
  padding: 0.5rem 0.5rem 1rem;
  @media (min-width: ${tabletMinWidth}px) {
    padding-right: ${({ isScrollable }) =>
      isScrollable
        ? /* istanbul ignore next: Tested by Cypress */ '8rem'
        : '1rem'};
    padding-left: 1rem;
  }
`
const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.75rem;
`
const Choice = styled('label')<{ isSelected: boolean }>`
  cursor: pointer;
  position: relative;
  display: grid;
  min-height: 2.5rem;
  align-items: center;
  border-radius: 0.125rem;
  background: ${({ isSelected }) => (isSelected ? '#028099' : 'white')};
  color: ${({ isSelected }) => (isSelected ? 'white' : undefined)};
  box-shadow: 0 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.14),
    0 0.1875rem 0.0625rem -0.125rem rgba(0, 0, 0, 0.12),
    0 0.0625rem 0.3125rem 0 rgba(0, 0, 0, 0.2);
  transition: background 0.25s, color 0.25s;
  button& {
    text-align: left;
  }
  :focus-within {
    outline: rgb(77, 144, 254) dashed 0.25rem;
  }
  :before {
    content: '${({ isSelected }) => (isSelected ? '✓' : '')}';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: white;
    border-right: 1px solid;
    border-color: ${({ isSelected }) => (isSelected ? '#028099' : 'lightgrey')};
    width: 3rem;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2rem;
    border-radius: 0.125rem 0 0 0.125rem;
    color: #028099;
  }
  & > div {
    padding: 0.5rem 0.5rem 0.5rem 4rem;
    @media (min-width: 480px) {
      padding: 1rem 1rem 1rem inherit;
    }
  }
`
const ChoiceInput = styled.input.attrs({
  type: 'checkbox',
})`
  margin-right: 0.5rem;
`
interface Props {
  contest: YesNoContestInterface
  vote: OptionalYesNoVote
  updateVote: UpdateVoteFunction
}

interface State {
  isScrollable: boolean
  isScrollAtBottom: boolean
  isScrollAtTop: boolean
  overvoteSelection: OptionalYesNoVote
}

const initialState = {
  isScrollable: false,
  isScrollAtBottom: true,
  isScrollAtTop: true,
  overvoteSelection: undefined,
}

export default class YesNoContest extends React.Component<Props> {
  public static contextType = BallotContext
  public state: State = initialState
  private scrollContainer = React.createRef<HTMLDivElement>()

  public componentDidMount() {
    this.updateContestChoicesScrollStates()
    window.addEventListener('resize', this.updateContestChoicesScrollStates)
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.props.vote !== prevProps.vote) {
      this.updateContestChoicesScrollStates()
    }
  }

  public handleDisabledClick = () => {
    // maybe we'll do more when a disabled item is clicked, for now nothing.
  }

  public handleUpdateSelection = (event: InputEvent) => {
    const target = event.target as HTMLInputElement
    const newVote = target.value as YesNoVote
    const { vote } = this.props
    if (vote === newVote) {
      this.props.updateVote(this.props.contest.id, undefined)
    } else {
      this.props.updateVote(this.props.contest.id, newVote)
    }
  }

  public handleChangeVoteAlert = (overvoteSelection: YesNoVote) => {
    this.setState({ overvoteSelection })
  }

  public updateContestChoicesScrollStates = () => {
    const target = this.scrollContainer.current
    /* istanbul ignore next */
    if (!target) {
      return
    }
    const isTabletMinWidth = target.offsetWidth >= tabletMinWidth
    const targetMinHeight =
      GLOBALS.FONT_SIZES[this.context.userSettings.textSize] * 8 // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1 // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop) // Windows Chrome scrolls to sub-pixel values.
    this.setState({
      isScrollable:
        isTabletMinWidth &&
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

  public scrollContestChoices = /* istanbul ignore next: Tested by Cypress */ (
    event: ButtonEvent
  ) => {
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
    scrollContainer.scrollTo({
      behavior: 'smooth',
      left: 0,
      top,
    })
  }

  public closeOvervoteAlert = () => {
    this.setState({
      overvoteSelection: initialState.overvoteSelection,
    })
  }

  public render() {
    const { contest, vote } = this.props
    const { overvoteSelection } = this.state
    const { isScrollable, isScrollAtBottom, isScrollAtTop } = this.state
    return (
      <React.Fragment>
        <Main noOverflow noPadding>
          <ContentHeader id="contest-header">
            <Prose>
              <h1 aria-label={`${contest.section}, ${contest.title}.`}>
                <ContestSection>{contest.section}</ContestSection>
                {contest.title}
              </h1>
              <p>
                <strong>Vote Yes or No.</strong>
              </p>
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
                <ContestDescription>
                  <Prose>
                    <TextWithLineBreaks text={contest.description} />
                  </Prose>
                </ContestDescription>
              </ScrollableContentWrapper>
            </ScrollContainer>
            {isScrollable /* istanbul ignore next: Tested by Cypress */ && (
              <ScrollControls aria-hidden="true">
                <Button
                  data-direction="up"
                  disabled={isScrollAtTop}
                  onClick={this.scrollContestChoices}
                  tabIndex={-1}
                >
                  ↑ See More
                </Button>
                <Button
                  data-direction="down"
                  disabled={isScrollAtBottom}
                  onClick={this.scrollContestChoices}
                  tabIndex={-1}
                >
                  ↓ See More
                </Button>
              </ScrollControls>
            )}
          </VariableContentContainer>
          <ContestFooter>
            <ChoicesGrid role="group" aria-labelledby="contest-header">
              {['Yes', 'No'].map(answer => {
                const answerLowerCase = answer.toLowerCase()
                const isChecked = vote === answerLowerCase
                const isDisabled = !isChecked && !!vote
                const handleDisabledClick = () => {
                  if (isDisabled) {
                    this.handleChangeVoteAlert(
                      answer.toLowerCase() as YesNoVote
                    )
                  }
                }
                return (
                  <Choice
                    key={answer}
                    htmlFor={answerLowerCase}
                    isSelected={isChecked}
                    onClick={handleDisabledClick}
                  >
                    <ChoiceInput
                      id={answerLowerCase}
                      name={contest.id}
                      value={answerLowerCase}
                      onChange={
                        isDisabled
                          ? this.handleDisabledClick
                          : this.handleUpdateSelection
                      }
                      checked={isChecked}
                      className="visually-hidden"
                    />
                    <Prose>
                      <Text wordBreak>{answer}</Text>
                    </Prose>
                  </Choice>
                )
              })}
            </ChoicesGrid>
          </ContestFooter>
        </Main>
        <Modal
          isOpen={!!overvoteSelection}
          content={
            <Prose>
              {overvoteSelection && (
                <p>
                  Do you want to change your vote to{' '}
                  <strong>{votes[overvoteSelection]}</strong>? To change your
                  vote, first unselect your vote for{' '}
                  <strong>
                    {
                      {
                        no: votes.yes,
                        yes: votes.no,
                      }[overvoteSelection]
                    }
                  </strong>
                  .
                </p>
              )}
            </Prose>
          }
          actions={
            <Button primary autoFocus onClick={this.closeOvervoteAlert}>
              Okay
            </Button>
          }
        />
      </React.Fragment>
    )
  }
}
