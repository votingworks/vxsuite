import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

export type PrintedBallotsQuery = UseQueryResult<Admin.PrintedBallotRecord[]>;

export interface Props {
  readonly ballotMode?: Admin.BallotMode;
}

/**
 * Gets the query key for the printed ballots query.
 */
export function getPrintedBallotsQueryKey({
  ballotMode,
}: Props = {}): QueryKey {
  return ballotMode ? ['printed-ballots', ballotMode] : ['printed-ballots'];
}

/**
 * Returns a query for all printed ballots for the current election.
 */
export function usePrintedBallotsQuery({
  ballotMode,
}: Props = {}): PrintedBallotsQuery {
  const { backend } = useContext(ServicesContext);

  return useQuery(getPrintedBallotsQueryKey({ ballotMode }), () =>
    backend.loadPrintedBallots({ ballotMode })
  );
}
