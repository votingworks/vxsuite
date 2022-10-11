import {
  useMutation,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  Election,
  Id,
  MarkThresholds,
  PageInterpretation,
  safeParseInt,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sheet } from './components/sheet';

interface CurrentSheet {
  id: Id;
  frontInterpretation: PageInterpretation;
  backInterpretation: PageInterpretation;
}

function useElectionQuery(): UseQueryResult<Election> {
  return useQuery(['election'], () =>
    fetch('/api/election').then((res) => res.json())
  );
}

function useCurrentSheetQuery({
  offset,
}: {
  offset: number;
}): UseQueryResult<CurrentSheet> {
  return useQuery(['currentSheet', `offset=${offset}`], async () => {
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: '1',
    });
    const response = await fetch(`/api/sheets?${params}`);
    const json = await response.json();
    return json.sheets[0];
  });
}

function useMarkThresholdsQuery(): UseQueryResult<MarkThresholds> {
  return useQuery(['markThresholds'], () =>
    fetch('/api/mark-thresholds').then((res) => res.json())
  );
}

function useSwapSheetImagesMutation(): UseMutationResult<void, unknown, Id> {
  const queryClient = useQueryClient();

  return useMutation(
    async (id: Id) => {
      await fetch(`/api/sheets/${id}/images/swap`, { method: 'POST' });
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['currentSheet']);
      },
    }
  );
}

function useRotateSheetImagesMutation(): UseMutationResult<void, unknown, Id> {
  const queryClient = useQueryClient();

  return useMutation(
    async (id: Id) => {
      await fetch(`/api/sheets/${id}/images/rotate`, { method: 'POST' });
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['currentSheet']);
      },
    }
  );
}

/**
 * Main app component.
 */
export function App(): JSX.Element | null {
  const [params, setSearchParams] = useSearchParams({ offset: '0' });
  const offset = safeParseInt(params.get('offset')).ok() ?? 0;
  const electionQuery = useElectionQuery();
  const markThresholdsQuery = useMarkThresholdsQuery();
  const currentSheetQuery = useCurrentSheetQuery({ offset });
  const swapSheetImagesMutation = useSwapSheetImagesMutation();
  const rotateSheetImagesMutation = useRotateSheetImagesMutation();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        setSearchParams({ offset: Math.max(0, offset - 1).toString() });
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        setSearchParams({ offset: (offset + 1).toString() });
        event.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [offset, setSearchParams]);

  useEffect(() => {
    if (!electionQuery.data || !markThresholdsQuery.data) {
      return;
    }

    document.title = `${electionQuery.data?.title} (${format.percent(
      markThresholdsQuery.data.marginal,
      { maximumFractionDigits: 2 }
    )}/${format.percent(markThresholdsQuery.data.definite, {
      maximumFractionDigits: 2,
    })})`;
  }, [electionQuery.data, markThresholdsQuery.data]);

  if (
    !electionQuery.data ||
    !markThresholdsQuery.data ||
    !currentSheetQuery.data
  ) {
    return null;
  }

  async function onSwap() {
    if (currentSheetQuery.data) {
      await swapSheetImagesMutation.mutateAsync(currentSheetQuery.data.id);
      location.reload();
    }
  }

  async function onRotate() {
    if (currentSheetQuery.data) {
      await rotateSheetImagesMutation.mutateAsync(currentSheetQuery.data.id);
      location.reload();
    }
  }

  return (
    <Sheet
      sheetId={currentSheetQuery.data.id}
      markThresholds={markThresholdsQuery.data}
      frontMarks={
        currentSheetQuery.data.frontInterpretation.type ===
        'InterpretedHmpbPage'
          ? currentSheetQuery.data.frontInterpretation.markInfo.marks
          : []
      }
      backMarks={
        currentSheetQuery.data.backInterpretation.type === 'InterpretedHmpbPage'
          ? currentSheetQuery.data.backInterpretation.markInfo.marks
          : []
      }
      onSwap={onSwap}
      onRotate={onRotate}
    />
  );
}
