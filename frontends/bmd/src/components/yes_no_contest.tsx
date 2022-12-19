import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  YesNoVote,
  OptionalYesNoVote,
  YesNoContest as YesNoContestInterface,
  Optional,
  YesOrNo,
} from '@votingworks/types';
import {
  Button,
  DisplayTextForYesOrNo,
  Main,
  Modal,
  Prose,
  Text,
  TextWithLineBreaks,
} from '@votingworks/ui';

import { assert, getSingleYesNoVote } from '@votingworks/utils';
import {
  EventTargetFunction,
  ScrollDirections,
  UpdateVoteFunction,
} from '../config/types';

import { BallotContext } from '../contexts/ballot_context';

import { FONT_SIZES } from '../config/globals';
import { ChoiceButton } from './choice_button';

import {
  ContentHeader,
  ContestFooter,
  ContestSection,
  VariableContentContainer,
  ScrollControls,
  ScrollContainer,
  ScrollableContentWrapper,
  ChoicesGrid,
  ContestDescription,
} from './contest_screen_layout';

interface Props {
  contest: YesNoContestInterface;
  vote: OptionalYesNoVote;
  updateVote: UpdateVoteFunction;
}

export function YesNoContest({
  contest,
  vote,
  updateVote,
}: Props): JSX.Element {
  const { userSettings } = useContext(BallotContext);
  const scrollContainer = useRef<HTMLDivElement>(null);

  const [isScrollable, setIsScrollable] = useState(false);
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true);
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const [overvoteSelection, setOvervoteSelection] =
    useState<Optional<YesOrNo>>();
  const [deselectedVote, setDeselectedVote] = useState('');

  useEffect(() => {
    if (deselectedVote !== '') {
      const timer = setTimeout(() => setDeselectedVote(''), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedVote]);

  const updateContestChoicesScrollStates = useCallback(() => {
    const target = scrollContainer.current;
    /* istanbul ignore next - `target` should always exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return;
    }
    const targetMinHeight = FONT_SIZES[userSettings.textSize] * 8; // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1; // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop); // Windows Chrome scrolls to sub-pixel values.
    setIsScrollable(
      /* istanbul ignore next: Tested by Cypress */
      target.scrollHeight > target.offsetHeight &&
        /* istanbul ignore next: Tested by Cypress */
        target.offsetHeight > targetMinHeight
    );
    setIsScrollAtBottom(
      windowsScrollTop +
        target.offsetHeight +
        windowsScrollTopOffsetMagicNumber >= // Windows Chrome "gte" check.
        target.scrollHeight
    );
    setIsScrollAtTop(target.scrollTop === 0);
  }, [scrollContainer, userSettings.textSize]);

  const voteLength = vote?.length;
  useEffect(() => {
    updateContestChoicesScrollStates();
    window.addEventListener('resize', updateContestChoicesScrollStates);
    return () => {
      window.removeEventListener('resize', updateContestChoicesScrollStates);
    };
  }, [voteLength, updateContestChoicesScrollStates]);

  const handleUpdateSelection: EventTargetFunction = (event) => {
    const newVote = (event.currentTarget as HTMLInputElement).dataset[
      'choice'
    ] as YesOrNo;
    if ((vote as string[] | undefined)?.includes(newVote)) {
      updateVote(contest.id, undefined);
      setDeselectedVote(newVote);
    } else {
      updateVote(contest.id, [newVote] as YesNoVote);
    }
  };

  function handleChangeVoteAlert(newValue: YesOrNo) {
    setOvervoteSelection(newValue);
  }

  /* istanbul ignore next: Tested by Cypress */
  const scrollContestChoices: EventTargetFunction = (event) => {
    const direction = (event.target as HTMLElement).dataset[
      'direction'
    ] as ScrollDirections;
    const sc = scrollContainer.current;
    assert(sc);
    const currentScrollTop = sc.scrollTop;
    const { offsetHeight } = sc;
    const { scrollHeight } = sc;
    const idealScrollDistance = Math.round(offsetHeight * 0.75);
    const maxScrollableDownDistance =
      scrollHeight - offsetHeight - currentScrollTop;
    const maxScrollTop =
      direction === 'down'
        ? currentScrollTop + maxScrollableDownDistance
        : currentScrollTop;
    const idealScrollTop =
      direction === 'down'
        ? currentScrollTop + idealScrollDistance
        : currentScrollTop - idealScrollDistance;
    const top = idealScrollTop > maxScrollTop ? maxScrollTop : idealScrollTop;
    sc.scrollTo({ behavior: 'smooth', left: 0, top });
  };

  function closeOvervoteAlert() {
    setOvervoteSelection(undefined);
  }

  return (
    <React.Fragment>
      <Main flexColumn>
        <ContentHeader id="contest-header">
          <Prose id="audiofocus">
            <h1 aria-label={`${contest.section} ${contest.title}.`}>
              <ContestSection>{contest.section}</ContestSection>
              {contest.title}
            </h1>
            <p>
              Vote <strong>Yes</strong> or <strong>No</strong>.
              <span className="screen-reader-only">
                {contest.description}
                To navigate through the contest choices, use the down button. To
                move to the next contest, use the right button.
              </span>
            </p>
          </Prose>
        </ContentHeader>
        <VariableContentContainer
          showTopShadow={!isScrollAtTop}
          showBottomShadow={!isScrollAtBottom}
        >
          <ScrollContainer
            ref={scrollContainer}
            onScroll={updateContestChoicesScrollStates}
          >
            <ScrollableContentWrapper isScrollable={isScrollable}>
              <ContestDescription>
                <Prose>
                  <TextWithLineBreaks text={contest.description} />
                </Prose>
              </ContestDescription>
            </ScrollableContentWrapper>
          </ScrollContainer>
          {
            /* istanbul ignore next: Tested by Cypress */ isScrollable && (
              <ScrollControls aria-hidden>
                <Button
                  className="scroll-up"
                  large
                  primary
                  aria-hidden
                  data-direction="up"
                  disabled={isScrollAtTop}
                  onPress={scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
                <Button
                  className="scroll-down"
                  large
                  primary
                  aria-hidden
                  data-direction="down"
                  disabled={isScrollAtBottom}
                  onPress={scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
              </ScrollControls>
            )
          }
        </VariableContentContainer>
        <ContestFooter>
          <ChoicesGrid data-testid="contest-choices">
            {[
              { label: 'Yes', vote: 'yes' } as const,
              { label: 'No', vote: 'no' } as const,
            ].map((answer) => {
              const isChecked = getSingleYesNoVote(vote) === answer.vote;
              const isDisabled = !isChecked && !!vote;
              function handleDisabledClick() {
                handleChangeVoteAlert(answer.vote);
              }
              let prefixAudioText = '';
              if (isChecked) {
                prefixAudioText = 'Selected,';
              } else if (deselectedVote === answer.vote) {
                prefixAudioText = 'Deselected,';
              }
              return (
                <ChoiceButton
                  key={answer.vote}
                  choice={answer.vote}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                >
                  <Prose>
                    <Text
                      aria-label={`${prefixAudioText} ${answer.label} on ${
                        contest.shortTitle ?? contest.title
                      }`}
                      wordBreak
                    >
                      {answer.label}
                    </Text>
                  </Prose>
                </ChoiceButton>
              );
            })}
          </ChoicesGrid>
        </ContestFooter>
      </Main>
      {overvoteSelection && (
        <Modal
          centerContent
          content={
            <Prose>
              {overvoteSelection && (
                <p id="modalaudiofocus">
                  Do you want to change your vote to{' '}
                  <strong>{DisplayTextForYesOrNo[overvoteSelection]}</strong>?
                  To change your vote, first unselect your vote for{' '}
                  <strong>
                    {
                      {
                        no: DisplayTextForYesOrNo.yes,
                        yes: DisplayTextForYesOrNo.no,
                      }[overvoteSelection]
                    }
                  </strong>
                  .
                </p>
              )}
            </Prose>
          }
          actions={
            <Button primary autoFocus onPress={closeOvervoteAlert}>
              Okay
            </Button>
          }
        />
      )}
    </React.Fragment>
  );
}
