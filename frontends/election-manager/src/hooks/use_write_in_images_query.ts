import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { Id } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface Props {
  readonly writeInId: Id;
  readonly enabled?: boolean;
}

export type WriteInsImagesQuery = UseQueryResult<Admin.WriteInImageEntry[]>;

/**
 * Gets the query key for the write-in image query.
 */
export function getWriteInImageQueryKey(props?: Props): QueryKey {
  return props ? ['write-in-image', props] : ['write-in-image'];
}

/**
 * Returns a query for write-in image data matching the given criteria.
 */
export function useWriteInImageQuery({
  writeInId,
  enabled = true,
}: Props): WriteInsImagesQuery {
  const { backend } = useContext(ServicesContext);

  return useQuery(
    getWriteInImageQueryKey({ writeInId }),
    () => backend.loadWriteInImage(writeInId),
    { enabled }
  );
}
