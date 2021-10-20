/**
 * FIXME: This file was written in haste and could use some cleanup:
 * - https://github.com/votingworks/vxsuite/issues/848
 * - https://github.com/votingworks/vxsuite/issues/849
 * - https://github.com/votingworks/vxsuite/issues/850
 */

import {
  AdjudicationReason,
  BallotPageContestLayout,
  CandidateContest,
  Contest,
  ElectionDefinition,
  InterpretedHmpbPage,
  Rect,
  SerializableBallotPageLayout,
  UnmarkedWriteInAdjudicationReasonInfo,
  WriteInAdjudicationReasonInfo,
  WriteInMarkAdjudication,
} from '@votingworks/types';
import { Side } from '@votingworks/types/api/module-scan';
import {
  Text,
  useCancelablePromise,
  useStoredState,
  useAutocomplete,
} from '@votingworks/ui';
import { find } from '@votingworks/utils';
import { strict as assert } from 'assert';
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import { z } from 'zod';
import BallotSheetImage from '../components/BallotSheetImage';
import Button from '../components/Button';
import CroppedImage from '../components/CroppedImage';
import Main from '../components/Main';
import MainNav from '../components/MainNav';
import Prose from '../components/Prose';
import Screen from '../components/Screen';
import AppContext from '../contexts/AppContext';

type CandidateNameList = readonly string[];
const CandidateNameListSchema: z.ZodSchema<CandidateNameList> = z.array(
  z.string()
);

type CandidateNamesByContestId = Record<Contest['id'], CandidateNameList>;
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
  style,
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
  imageURL,
  bounds,
}: {
  imageURL: string;
  bounds: Rect;
}) {
  return (
    <CroppedImage
      src={imageURL}
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
  imageURL: string;
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
  imageURL,
  contest,
  writeIn,
  layout,
  adjudications,
  onChange,
  autoFocus,
  writeInPresets,
}: ContestOptionAdjudicationProps): JSX.Element {
  const writeInIndex = writeIn.optionIndex;
  const { bounds } = layout.options[writeInIndex];
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
        <WriteInImage imageURL={imageURL} bounds={bounds} />
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
  imageURL: string;
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
  imageURL,
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
          imageURL={imageURL}
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

function WriteInAdjudicationByContest({
  electionDefinition,
  imageURL,
  interpretation,
  layout,
  contestIds,
  adjudications,
  onContestChange,
  onAdjudicationChanged,
  onAdjudicationComplete,
  writeInPresets,
}: {
  electionDefinition: ElectionDefinition;
  imageURL: string;
  interpretation: InterpretedHmpbPage;
  layout: SerializableBallotPageLayout;
  contestIds: ReadonlyArray<Contest['id']>;
  adjudications: readonly WriteInMarkAdjudication[];
  onContestChange?(contestId?: Contest['id']): void;
  onAdjudicationChanged?(adjudication: WriteInMarkAdjudication): void;
  onAdjudicationComplete(): Promise<void>;
  writeInPresets: CandidateNamesByContestId;
}): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedContestIndex, setSelectedContestIndex] = useState(0);

  const writeIns = interpretation.adjudicationInfo.enabledReasonInfos.filter(
    (
      reason
    ): reason is
      | WriteInAdjudicationReasonInfo
      | UnmarkedWriteInAdjudicationReasonInfo =>
      reason.type === AdjudicationReason.WriteIn ||
      reason.type === AdjudicationReason.UnmarkedWriteIn
  );
  const contestsWithWriteIns = new Set(
    [...writeIns].map(({ contestId }) => contestId)
  );
  const contestsWithWriteInsCount = contestsWithWriteIns.size;
  const selectedContestId = [...contestsWithWriteIns][selectedContestIndex];
  const isFirstContestSelected = selectedContestIndex === 0;
  const isLastContestSelected =
    selectedContestIndex === contestsWithWriteInsCount - 1;

  const onAdjudicationChange = useCallback(
    (adjudication: WriteInMarkAdjudication) => {
      onAdjudicationChanged?.(adjudication);
    },
    [onAdjudicationChanged]
  );

  useEffect(() => {
    onContestChange?.(selectedContestId);
  }, [selectedContestId, onContestChange]);

  const contestIndex = contestIds.findIndex((id) => id === selectedContestId);
  const contestsWithWriteInsIndex = [...contestsWithWriteIns].findIndex(
    (id) => id === selectedContestId
  );
  const contest = find(
    electionDefinition.election.contests,
    (c): c is CandidateContest => c.id === selectedContestId
  );
  const writeInsForContest = writeIns.filter(
    (writeIn) => writeIn.contestId === selectedContestId
  );
  const contestLayout = layout.contests[contestIndex];
  const allWriteInsHaveValues = writeInsForContest.every((writeIn) =>
    adjudications.some(
      (adjudication) =>
        adjudication.contestId === writeIn.contestId &&
        adjudication.optionId === writeIn.optionId &&
        (!adjudication.isMarked || adjudication.name)
    )
  );

  const goPrevious = useCallback(() => {
    setSelectedContestIndex((prev) => Math.max(0, prev - 1));
  }, []);
  const goNext = useCallback(
    async (event?: React.FormEvent<EventTarget>): Promise<void> => {
      event?.preventDefault();
      if (isLastContestSelected) {
        setIsSaving(true);
        try {
          await makeCancelable(onAdjudicationComplete());
        } finally {
          setIsSaving(false);
        }
      } else {
        setSelectedContestIndex((prev) => prev + 1);
      }
    },
    [isLastContestSelected, makeCancelable, onAdjudicationComplete]
  );

  return (
    <form onSubmit={goNext}>
      <p>
        Adjudicate each write-in by typing the name you see, or by indicating it
        is not a write-in.
      </p>
      <ContestAdjudication
        key={selectedContestId}
        imageURL={imageURL}
        contest={contest}
        writeInsForContest={writeInsForContest}
        layout={contestLayout}
        onChange={onAdjudicationChange}
        adjudications={adjudications}
        writeInPresets={writeInPresets}
      />
      <HStack reverse>
        <Button
          onPress={goNext}
          primary
          disabled={isSaving || !allWriteInsHaveValues}
        >
          {!isLastContestSelected ? 'Next Contest' : 'Save & Continue Scanning'}
        </Button>
        <Spacer />
        <Text small style={{ marginLeft: '10px' }}>
          Contest {contestsWithWriteInsIndex + 1} of {contestsWithWriteInsCount}
        </Text>
        <Spacer />
        <Button onPress={goPrevious} disabled={isFirstContestSelected}>
          Previous Contest
        </Button>
      </HStack>
    </form>
  );
}

export interface Props {
  sheetId: string;
  side: Side;
  imageURL: string;
  interpretation: InterpretedHmpbPage;
  layout: SerializableBallotPageLayout;
  contestIds: ReadonlyArray<Contest['id']>;
  onAdjudicationComplete?(
    sheetId: string,
    side: Side,
    adjudications: readonly WriteInMarkAdjudication[]
  ): Promise<void>;
}

export default function WriteInAdjudicationScreen({
  sheetId,
  side,
  imageURL,
  interpretation,
  layout,
  contestIds,
  onAdjudicationComplete,
}: Props): JSX.Element {
  const { electionDefinition, storage } = useContext(AppContext);
  assert(electionDefinition);

  const [adjudications, setAdjudications] = useState<
    readonly WriteInMarkAdjudication[]
  >([]);
  const [selectedContestId, setSelectedContestId] = useState<Contest['id']>();

  const writeIns = interpretation.adjudicationInfo.enabledReasonInfos.filter(
    (
      reason
    ): reason is
      | WriteInAdjudicationReasonInfo
      | UnmarkedWriteInAdjudicationReasonInfo =>
      reason.type === AdjudicationReason.WriteIn ||
      reason.type === AdjudicationReason.UnmarkedWriteIn
  );
  const styleForContest = useCallback(
    (id: Contest['id']): React.CSSProperties => {
      const contestsWithWriteIns = new Set(
        [...writeIns].map(({ contestId }) => contestId)
      );
      return id === selectedContestId
        ? { backgroundColor: FOCUS_COLOR }
        : contestsWithWriteIns.has(id)
        ? { backgroundColor: HIGHLIGHTER_COLOR }
        : {};
    },
    [selectedContestId, writeIns]
  );

  const onContestChange = useCallback((contestId?: Contest['id']): void => {
    setSelectedContestId(contestId);
  }, []);

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

  const [storedWriteIns, setStoredWriteIns] = useStoredState(
    storage,
    getUsedWriteInsStorageKey(electionDefinition),
    CandidateNamesByContestIdSchema,
    {}
  );

  const onAdjudicationCompleteInternal = useCallback(async (): Promise<void> => {
    setStoredWriteIns((prev) =>
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
  }, [setStoredWriteIns, onAdjudicationComplete, sheetId, side, adjudications]);

  return (
    <Screen>
      <MainNav />
      <Main>
        <MainChildColumns>
          <Prose maxWidth={false}>
            <Header>Write-In Adjudication</Header>
            <WriteInAdjudicationByContest
              electionDefinition={electionDefinition}
              imageURL={imageURL}
              interpretation={interpretation}
              layout={layout}
              contestIds={contestIds}
              adjudications={adjudications}
              onContestChange={onContestChange}
              onAdjudicationChanged={onAdjudicationChanged}
              onAdjudicationComplete={onAdjudicationCompleteInternal}
              writeInPresets={storedWriteIns}
            />
          </Prose>
          <BallotSheetImage
            imageURL={imageURL}
            layout={layout}
            contestIds={contestIds}
            styleForContest={styleForContest}
          />
        </MainChildColumns>
      </Main>
    </Screen>
  );
}
