/**
 * FIXME: This file was written in haste and could use some cleanup:
 * - https://github.com/votingworks/vxsuite/issues/848
 * - https://github.com/votingworks/vxsuite/issues/849
 * - https://github.com/votingworks/vxsuite/issues/850
 */

import {
  BallotPageContestLayout,
  BallotPageLayout,
  CandidateContest,
  ContestId,
  ElectionDefinition,
  Rect,
  UnmarkedWriteInAdjudicationReasonInfo,
  WriteInAdjudicationReasonInfo,
  WriteInMarkAdjudication,
} from '@votingworks/types';
import { Side } from '@votingworks/types/api/services/scan';
import {
  Text,
  useAutocomplete,
  useCancelablePromise,
  useStoredState,
} from '@votingworks/ui';
import { assert, find } from '@votingworks/utils';
import React, {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import { z } from 'zod';
import { BallotSheetImage } from '../components/ballot_sheet_image';
import { Button } from '../components/button';
import { CroppedImage } from '../components/cropped_image';
import { Main } from '../components/main';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';
import { Screen } from '../components/screen';
import { AppContext } from '../contexts/app_context';

type CandidateNameList = readonly string[];
const CandidateNameListSchema: z.ZodSchema<CandidateNameList> = z.array(
  z.string()
);

type CandidateNamesByContestId = Record<ContestId, CandidateNameList>;
const CandidateNamesByContestIdSchema: z.ZodSchema<CandidateNamesByContestId> = z.record(
  CandidateNameListSchema
);

function getUsedWriteInsStorageKey(
  electionDefinition: ElectionDefinition
): string {
  return `used-write-ins-for-election-${electionDefinition.electionHash}`;
}

function uniq<T>(array: readonly T[]): T[] {
  return [...new Set(array)];
}

function Stack({
  as = 'div',
  children,
  flexDirection,
  style = {},
}: {
  as?: string;
  children: React.ReactNode;
  flexDirection: React.CSSProperties['flexDirection'];
  style?: React.CSSProperties;
}): JSX.Element {
  return React.createElement(
    as,
    { style: { display: 'flex', flex: '1', flexDirection, ...style } },
    null,
    ...(Array.isArray(children) ? children : [children])
  );
}

function VStack({
  as,
  children,
  style,
  reverse,
}: {
  as?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  reverse?: boolean;
}): JSX.Element {
  return (
    <Stack
      as={as}
      flexDirection={reverse ? 'column-reverse' : 'column'}
      style={style}
    >
      {children}
    </Stack>
  );
}

function HStack({
  as,
  children,
  style,
  reverse,
}: {
  as?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  reverse?: boolean;
}): JSX.Element {
  return (
    <Stack
      as={as}
      flexDirection={reverse ? 'row-reverse' : 'row'}
      style={style}
    >
      {children}
    </Stack>
  );
}

function Spacer({
  flex = 1,
}: {
  flex?: React.CSSProperties['flex'];
}): JSX.Element {
  return <div style={{ flex }} />;
}

const Header = styled.div`
  font-size: 3em;
  font-weight: 900;
`;

const ContestHeader = styled.div`
  font-size: 1.5em;
  font-weight: 900;
`;

const MainChildColumns = styled.div`
  flex: 1;
  display: flex;
  margin-bottom: -1rem;
  > div {
    margin-right: 1em;
    &:first-child {
      flex: 1;
    }
    &:last-child {
      margin-right: 0;
    }
  }
  button {
    margin-top: 0.3rem;
  }
`;

const Checkbox = styled.input`
  &:focus {
    box-shadow: 0 0 0 4px rgba(21, 156, 228, 0.4);
  }
`;

const HIGHLIGHTER_COLOR = '#fbff0016';
const FOCUS_COLOR = '#fbff007d';
const EXTRA_WRITE_IN_MARGIN_PERCENTAGE = 0.3;

const WriteInAdjudicationBox = styled.div`
  background-color: #ffffff;
  padding: 20px 15px;
  margin: 1em 0;
`;

function WriteInLabel({
  contest,
  writeIn,
}: {
  contest: CandidateContest;
  writeIn:
    | WriteInAdjudicationReasonInfo
    | UnmarkedWriteInAdjudicationReasonInfo;
}) {
  return (
    <HStack>
      <div>
        <strong>Write-In</strong>
      </div>
      <Text style={{ margin: '0 0.25em' }}>
        (line {writeIn.optionIndex - contest.candidates.length + 1})
      </Text>
    </HStack>
  );
}

function WriteInImage({
  imageUrl,
  bounds,
}: {
  imageUrl: string;
  bounds: Rect;
}) {
  return (
    <CroppedImage
      src={imageUrl}
      alt="write-in area"
      crop={{
        x: bounds.x,
        y: bounds.y - bounds.height * EXTRA_WRITE_IN_MARGIN_PERCENTAGE,
        width: bounds.width,
        height: bounds.height * (1 + 2 * EXTRA_WRITE_IN_MARGIN_PERCENTAGE),
      }}
      style={{
        boxShadow: '4px 4px 3px 3px #999',
        width: '50%',
      }}
    />
  );
}

interface ContestOptionAdjudicationProps {
  imageUrl: string;
  contest: CandidateContest;
  writeIn:
    | WriteInAdjudicationReasonInfo
    | UnmarkedWriteInAdjudicationReasonInfo;
  layout: BallotPageContestLayout;
  adjudications: readonly WriteInMarkAdjudication[];
  onChange?(adjudication: WriteInMarkAdjudication): void;
  autoFocus?: boolean;
  writeInPresets: CandidateNamesByContestId;
}

function ContestOptionAdjudication({
  imageUrl,
  contest,
  writeIn,
  layout,
  adjudications,
  onChange,
  autoFocus,
  writeInPresets,
}: ContestOptionAdjudicationProps): JSX.Element {
  const writeInIndex = writeIn.optionIndex;
  const { bounds } =
    layout.options.find(
      ({ definition }) => definition?.optionIndex === writeIn.optionIndex
    ) ?? layout.options[writeInIndex];
  const adjudication = adjudications.find(
    ({ contestId, optionId }) =>
      contestId === writeIn.contestId && optionId === writeIn.optionId
  );
  const isWriteIn = adjudication?.isMarked ?? true;

  const [
    shouldFocusNameOnNextRender,
    setShouldFocusNameOnNextRender,
  ] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onConfirmAutocomplete = useCallback(
    (name: string): void => {
      onChange?.({
        type: writeIn.type,
        isMarked: true,
        contestId: contest.id,
        optionId: writeIn.optionId,
        name,
      });
    },
    [contest.id, onChange, writeIn.optionId, writeIn.type]
  );

  const onInput = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      onConfirmAutocomplete(input.value);
    },
    [onConfirmAutocomplete]
  );

  const onCheckboxChange = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      if (!input.checked) {
        onChange?.({
          type: writeIn.type,
          isMarked: true,
          contestId: contest.id,
          optionId: writeIn.optionId,
          name: '',
        });
        setShouldFocusNameOnNextRender(true);
      } else {
        assert(inputRef.current);
        inputRef.current.value = '';
        onChange?.({
          type: writeIn.type,
          isMarked: false,
          contestId: contest.id,
          optionId: writeIn.optionId,
        });
      }
    },
    [contest.id, onChange, writeIn.optionId, writeIn.type]
  );

  useLayoutEffect(() => {
    if (shouldFocusNameOnNextRender) {
      inputRef.current?.focus();
      setShouldFocusNameOnNextRender(false);
    }
  }, [shouldFocusNameOnNextRender]);

  const getOptionLabel = useCallback((name: string): string => name, []);

  const writeInsForContest = writeInPresets[writeIn.contestId] ?? [];
  const autocomplete = useAutocomplete({
    options: writeInsForContest,
    getOptionLabel,
    onConfirm: onConfirmAutocomplete,
  });

  return (
    <WriteInAdjudicationBox key={writeIn.optionId}>
      <HStack>
        <WriteInImage imageUrl={imageUrl} bounds={bounds} />
        <Spacer />
        <VStack>
          <VStack as="label">
            <WriteInLabel contest={contest} writeIn={writeIn} />
            <input
              type="text"
              ref={inputRef}
              {...autocomplete.getInputProps({ onInput })}
              placeholder={
                isWriteIn ? 'type voter write-in here' : 'not a write-in'
              }
              style={{ width: '450px', fontSize: '1.5em' }}
              data-testid={`write-in-input-${writeIn.optionId}`}
              disabled={!isWriteIn}
              defaultValue={
                adjudication?.isMarked ? adjudication.name : undefined
              }
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={autoFocus}
            />
          </VStack>
          <label>
            <Checkbox
              type="checkbox"
              checked={!isWriteIn}
              data-testid={`write-in-checkbox-${writeIn.optionId}`}
              onChange={onCheckboxChange}
            />{' '}
            This is <strong>not</strong> a write-in.
          </label>
          <Spacer />
        </VStack>
      </HStack>
    </WriteInAdjudicationBox>
  );
}

interface ContestAdjudicationProps {
  imageUrl: string;
  contest: CandidateContest;
  layout: BallotPageContestLayout;
  writeInsForContest: ReadonlyArray<
    WriteInAdjudicationReasonInfo | UnmarkedWriteInAdjudicationReasonInfo
  >;
  onChange?(adjudication: WriteInMarkAdjudication): void;
  adjudications: readonly WriteInMarkAdjudication[];
  writeInPresets: CandidateNamesByContestId;
}

function ContestAdjudication({
  imageUrl,
  contest,
  layout,
  writeInsForContest,
  onChange,
  adjudications,
  writeInPresets,
}: ContestAdjudicationProps): JSX.Element {
  return (
    <div>
      <HStack style={{ alignItems: 'center' }}>
        <ContestHeader>{contest.title}</ContestHeader>
      </HStack>
      {writeInsForContest.map((writeIn, i) => (
        <ContestOptionAdjudication
          key={writeIn.optionId}
          adjudications={adjudications}
          contest={contest}
          imageUrl={imageUrl}
          layout={layout}
          writeIn={writeIn}
          onChange={onChange}
          autoFocus={i === 0}
          writeInPresets={writeInPresets}
        />
      ))}
    </div>
  );
}

export interface Props {
  /**
   * Database ID of the sheet being adjudicated.
   */
  sheetId: string;

  /**
   * Which side of the sheet being adjudicated.
   */
  side: Side;

  /**
   * URL of the image to the whole ballot page being adjudicated.
   */
  imageUrl: string;

  /**
   * All write-ins flagged for adjudication on this page.
   */
  writeIns: ReadonlyArray<
    WriteInAdjudicationReasonInfo | UnmarkedWriteInAdjudicationReasonInfo
  >;

  /**
   * Layout of the ballot page being adjudicated. The number of contests in this
   * layout must match the number of contests in `allContestIds`.
   */
  layout: BallotPageLayout;

  /**
   * Contest IDs for every contest on this page, even those without write-ins.
   */
  allContestIds: readonly ContestId[];

  /**
   * Callback for when every contest with write-ins has been adjudicated and
   * the user has chosen to save their adjudication.
   */
  onAdjudicationComplete?(
    sheetId: string,
    side: Side,
    adjudications: readonly WriteInMarkAdjudication[]
  ): Promise<void>;
}

export function WriteInAdjudicationScreen({
  sheetId,
  side,
  imageUrl,
  writeIns,
  layout,
  allContestIds,
  onAdjudicationComplete,
}: Props): JSX.Element {
  const { electionDefinition, storage } = useContext(AppContext);
  assert(electionDefinition);

  const contestsWithWriteInsIds = useMemo(
    () => uniq([...writeIns].map(({ contestId }) => contestId)),
    [writeIns]
  );

  const makeCancelable = useCancelablePromise();
  const [adjudications, setAdjudications] = useState<
    readonly WriteInMarkAdjudication[]
  >([]);
  const [selectedContestIndex, setSelectedContestIndex] = useState(0);
  const selectedContestId = contestsWithWriteInsIds[selectedContestIndex];
  const [isSaving, setIsSaving] = useState(false);

  const styleForContest = useCallback(
    (contestId: ContestId): React.CSSProperties => {
      return contestId === selectedContestId
        ? { backgroundColor: FOCUS_COLOR }
        : writeIns.some((writeIn) => writeIn.contestId === contestId)
        ? { backgroundColor: HIGHLIGHTER_COLOR }
        : {};
    },
    [selectedContestId, writeIns]
  );

  const onAdjudicationChanged = useCallback(
    (adjudication: WriteInMarkAdjudication): void => {
      setAdjudications((prev) => [
        ...prev.filter(
          ({ contestId, optionId }) =>
            !(
              contestId === adjudication.contestId &&
              optionId === adjudication.optionId
            )
        ),
        adjudication,
      ]);
    },
    []
  );

  const [writeInPresets, setWriteInPresets] = useStoredState(
    storage,
    getUsedWriteInsStorageKey(electionDefinition),
    CandidateNamesByContestIdSchema,
    {}
  );

  const onAdjudicationCompleteInternal = useCallback(async (): Promise<void> => {
    setWriteInPresets((prev) =>
      adjudications.reduce(
        (newStoredWriteIns, adjudication) =>
          adjudication.isMarked
            ? {
                ...newStoredWriteIns,
                [adjudication.contestId]: uniq([
                  ...(newStoredWriteIns[adjudication.contestId] ?? []),
                  adjudication.name,
                ]),
              }
            : newStoredWriteIns,
        prev
      )
    );
    await onAdjudicationComplete?.(sheetId, side, adjudications);
  }, [adjudications, onAdjudicationComplete, setWriteInPresets, sheetId, side]);

  const isFirstContestSelected =
    selectedContestId === contestsWithWriteInsIds[0];
  const isLastContestSelected =
    selectedContestId ===
    contestsWithWriteInsIds[contestsWithWriteInsIds.length - 1];

  const contest = find(
    electionDefinition.election.contests,
    (c): c is CandidateContest => c.id === selectedContestId
  );
  const writeInsForContest = writeIns.filter(
    (writeIn) => writeIn.contestId === selectedContestId
  );
  const contestLayout =
    layout.contests[allContestIds.indexOf(selectedContestId)];
  const allWriteInsHaveValues = writeInsForContest.every((writeIn) =>
    adjudications.some(
      (adjudication) =>
        adjudication.contestId === writeIn.contestId &&
        adjudication.optionId === writeIn.optionId &&
        (!adjudication.isMarked || adjudication.name)
    )
  );

  const goPrevious = useCallback(() => {
    setSelectedContestIndex((prev) => prev - 1);
  }, []);

  const goNext = useCallback(
    async (event?: React.FormEvent<EventTarget>): Promise<void> => {
      event?.preventDefault();
      if (isLastContestSelected) {
        setIsSaving(true);
        try {
          await makeCancelable(onAdjudicationCompleteInternal());
        } finally {
          setIsSaving(false);
        }
      } else {
        setSelectedContestIndex((prev) => prev + 1);
      }
    },
    [isLastContestSelected, makeCancelable, onAdjudicationCompleteInternal]
  );

  return (
    <Screen>
      <MainNav />
      <Main>
        <MainChildColumns>
          <Prose maxWidth={false}>
            <Header>Write-In Adjudication</Header>
            <form onSubmit={goNext}>
              <p>
                Adjudicate each write-in by typing the name you see, or by
                indicating it is not a write-in.
              </p>
              <ContestAdjudication
                key={selectedContestId}
                imageUrl={imageUrl}
                contest={contest}
                writeInsForContest={writeInsForContest}
                layout={contestLayout}
                onChange={onAdjudicationChanged}
                adjudications={adjudications}
                writeInPresets={writeInPresets}
              />
              <HStack reverse>
                <Button
                  onPress={goNext}
                  primary
                  disabled={isSaving || !allWriteInsHaveValues}
                >
                  {!isLastContestSelected
                    ? 'Next Contest'
                    : 'Save & Continue Scanning'}
                </Button>
                <Spacer />
                <Text small style={{ marginLeft: '10px' }}>
                  Contest {selectedContestIndex + 1} of{' '}
                  {contestsWithWriteInsIds.length}
                </Text>
                <Spacer />
                <Button onPress={goPrevious} disabled={isFirstContestSelected}>
                  Previous Contest
                </Button>
              </HStack>
            </form>
          </Prose>
          <BallotSheetImage
            imageUrl={imageUrl}
            layout={layout}
            contestIds={allContestIds}
            styleForContest={styleForContest}
          />
        </MainChildColumns>
      </Main>
    </Screen>
  );
}
