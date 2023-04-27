import { assert } from '@votingworks/basics';
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import {
  P,
  Button,
  ContestChoiceButton,
  H1,
  Main,
  Prose,
  Text,
  TextWithLineBreaks,
} from '@votingworks/ui';

import { YesNoVote, OptionalYesNoVote } from '@votingworks/types';

import { ScrollDirections, UpdateVoteFunction } from '../config/types';
import {
  getContestDistrictName,
  MsEitherNeitherContest as MsEitherNeitherContestInterface,
} from '../utils/ms_either_neither_contests';
import { FONT_SIZES } from '../config/globals';
import {
  ContentHeader,
  DistrictName,
  VariableContentContainer,
  ScrollControls,
  ScrollContainer,
  ScrollableContentWrapper,
} from './contest_screen_layout';
import { BallotContext } from '../contexts/ballot_context';

const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 1rem;
  grid-template-areas:
    'either-neither-label divider pick-one-label'
    'either-option divider first-option'
    'neither-option divider second-option';
  grid-template-columns: 1fr calc(2rem + 1px) 1fr;
  grid-template-rows: auto;
  padding: 1rem 2rem;
`;
const GridLabel = styled.div`
  display: flex;
  align-items: flex-end;
`;
const Divider = styled.div`
  display: flex;
  grid-area: divider;
  justify-content: center;
  &::before {
    background: #000000;
    width: 2px;
    content: '';
  }
`;

interface Props {
  contest: MsEitherNeitherContestInterface;
  eitherNeitherContestVote: OptionalYesNoVote;
  pickOneContestVote: OptionalYesNoVote;
  updateVote: UpdateVoteFunction;
}

export function MsEitherNeitherContest({
  contest,
  eitherNeitherContestVote,
  pickOneContestVote,
  updateVote,
}: Props): JSX.Element {
  const { userSettings, electionDefinition } = useContext(BallotContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const scrollContainer = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(true);
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true);
  const [deselectedOption, setDeselectedOption] = useState<
    'either' | 'neither' | 'first' | 'second'
  >();
  const showTopShadow = true;
  const showBottomShadow = true;

  function handleUpdateEitherNeither(targetVote: string) {
    const currentVote = eitherNeitherContestVote?.[0];
    const newVote =
      currentVote === targetVote ? ([] as YesNoVote) : [targetVote];
    setDeselectedOption(
      currentVote === 'yes'
        ? 'either'
        : currentVote === 'no'
        ? 'neither'
        : undefined
    );
    updateVote(contest.eitherNeitherContestId, newVote as YesNoVote);
  }
  function handleUpdatePickOne(targetVote: string) {
    const currentVote = pickOneContestVote?.[0];
    const newVote =
      currentVote === targetVote ? ([] as YesNoVote) : [targetVote];
    setDeselectedOption(
      currentVote === 'yes'
        ? 'first'
        : currentVote === 'no'
        ? 'second'
        : undefined
    );
    updateVote(contest.pickOneContestId, newVote as YesNoVote);
  }

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
  }, [userSettings.textSize]);

  /* istanbul ignore next: Tested by Cypress */
  function scrollContestChoices(direction: ScrollDirections) {
    const sc = scrollContainer.current;
    assert(sc);
    const currentScrollTop = sc.scrollTop;
    const { offsetHeight, scrollHeight } = sc;
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
    sc.scrollTo({
      behavior: 'smooth',
      left: 0,
      top,
    });
  }

  useEffect(() => {
    updateContestChoicesScrollStates();
    window.addEventListener('resize', updateContestChoicesScrollStates);
    return () => {
      window.removeEventListener('resize', updateContestChoicesScrollStates);
    };
  }, [updateContestChoicesScrollStates]);

  useEffect(() => {
    updateContestChoicesScrollStates();
  }, [
    eitherNeitherContestVote,
    pickOneContestVote,
    updateContestChoicesScrollStates,
  ]);

  const districtName = getContestDistrictName(election, contest);
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  const forEither = '“for either”';
  const againstBoth = '“against both”';
  const eitherLabel = eitherNeitherVote === 'yes' ? forEither : againstBoth;
  const pickOneVote = pickOneContestVote?.[0];

  const eitherSelected = eitherNeitherContestVote?.[0] === 'yes';
  const neitherSelected = eitherNeitherContestVote?.[0] === 'no';
  const firstSelected = pickOneContestVote?.[0] === 'yes';
  const secondSelected = pickOneContestVote?.[0] === 'no';

  useEffect(() => {
    if (deselectedOption) {
      const timer = setTimeout(() => setDeselectedOption(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedOption]);

  return (
    <Main flexColumn>
      <ContentHeader>
        <Prose>
          <H1 aria-label={`${districtName} ${contest.title}.`}>
            <DistrictName>{districtName}</DistrictName>
            {contest.title}
          </H1>
          <P>
            {eitherNeitherVote && pickOneVote ? (
              <span>
                You have selected {eitherLabel} and your preferred measure.
              </span>
            ) : eitherNeitherVote && !pickOneVote ? (
              <span>
                You have selected {eitherLabel}.{' '}
                {eitherNeitherVote === 'yes' ? (
                  <strong>Now select your preferred measure.</strong>
                ) : (
                  <strong>
                    You may additionally select your preferred measure.
                  </strong>
                )}
              </span>
            ) : !eitherNeitherVote && pickOneVote ? (
              <span>
                You have selected your preferred measure.{' '}
                <strong>
                  Now vote {forEither} or {againstBoth}.
                </strong>
              </span>
            ) : (
              <span>
                First vote {forEither} or {againstBoth}. Then select your
                preferred measure.
              </span>
            )}
            <span className="screen-reader-only">
              To navigate through the contest choices, use the down button. To
              move to the next contest, use the right button.
            </span>
          </P>
        </Prose>
      </ContentHeader>
      <VariableContentContainer
        showTopShadow={showTopShadow}
        showBottomShadow={showBottomShadow}
      >
        <ScrollContainer
          ref={scrollContainer}
          onScroll={updateContestChoicesScrollStates}
        >
          <ScrollableContentWrapper isScrollable={isScrollable}>
            <Prose>
              <TextWithLineBreaks
                style={{
                  fontSize: '0.95rem',
                }}
                text={contest.description}
              />
            </Prose>
          </ScrollableContentWrapper>
        </ScrollContainer>
        {isScrollable /* istanbul ignore next: Tested by Cypress */ && (
          <ScrollControls aria-hidden>
            <Button
              className="scroll-up"
              large
              variant="primary"
              aria-hidden
              value="up"
              disabled={isScrollAtTop}
              onPress={scrollContestChoices}
            >
              <span>See More</span>
            </Button>
            <Button
              className="scroll-down"
              large
              variant="primary"
              aria-hidden
              value="down"
              disabled={isScrollAtBottom}
              onPress={scrollContestChoices}
            >
              <span>See More</span>
            </Button>
          </ScrollControls>
        )}
      </VariableContentContainer>
      <ChoicesGrid>
        <GridLabel
          style={{
            gridArea: 'either-neither-label',
          }}
        >
          <Prose>
            <Text
              small
              bold
              style={{
                fontSize: '0.7rem',
              }}
            >
              {contest.eitherNeitherLabel}
            </Text>
          </Prose>
        </GridLabel>
        <ContestChoiceButton
          choice="yes"
          isSelected={eitherSelected}
          onPress={handleUpdateEitherNeither}
          gridArea="either-option"
          ariaLabel={`${
            eitherSelected
              ? 'Selected, '
              : deselectedOption === 'either'
              ? 'Deselected, '
              : ''
          }${contest.eitherOption.label}`}
          label={contest.eitherOption.label}
        />
        <ContestChoiceButton
          choice="no"
          isSelected={neitherSelected}
          onPress={handleUpdateEitherNeither}
          gridArea="neither-option"
          ariaLabel={`${
            neitherSelected
              ? 'Selected, '
              : deselectedOption === 'neither'
              ? 'Deselected, '
              : ''
          }${contest.neitherOption.label}`}
          label={contest.neitherOption.label}
        />
        <GridLabel
          style={{
            gridArea: 'pick-one-label',
          }}
        >
          <Prose>
            <Text
              small
              bold
              style={{
                fontSize: '0.7rem',
              }}
            >
              {contest.pickOneLabel}
            </Text>
          </Prose>
        </GridLabel>
        <ContestChoiceButton
          choice="yes"
          isSelected={firstSelected}
          onPress={handleUpdatePickOne}
          gridArea="first-option"
          ariaLabel={`${
            firstSelected
              ? 'Selected, '
              : deselectedOption === 'first'
              ? 'Deselected, '
              : ''
          }${contest.firstOption.label}`}
          label={contest.firstOption.label}
        />
        <ContestChoiceButton
          choice="no"
          isSelected={secondSelected}
          onPress={handleUpdatePickOne}
          gridArea="second-option"
          ariaLabel={`${
            secondSelected
              ? 'Selected, '
              : deselectedOption === 'second'
              ? 'Deselected, '
              : ''
          }${contest.secondOption.label}`}
          label={contest.secondOption.label}
        />
        <Divider />
      </ChoicesGrid>
    </Main>
  );
}
