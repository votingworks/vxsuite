import { generatePath, useRouteMatch } from 'react-router-dom';
import type { ElectionStringKey } from '@votingworks/types';

export interface ListDetailAudioParams {
  id: string;
  stringKey: ElectionStringKey;
  subkey?: string;
}

export interface ListDetailRoutes {
  readonly rootPath: string;
  readonly addPath: string;
  readonly viewPath: string;
  readonly editPath: string;
  readonly audioPath: string;
  readonly rootUrl: string;
  readonly addUrl: string;
  readonly viewUrl: (id: string) => string;
  readonly editUrl: (id: string) => string;
  readonly audioUrl: (params: ListDetailAudioParams) => string;
}

export function useListDetailRoutes(
  idParam: string,
  audioParamsPattern: string
): ListDetailRoutes {
  const { path, params } = useRouteMatch();
  const addPath = `${path}/add`;
  const viewPath = `${path}/:${idParam}`;
  const editPath = `${viewPath}/edit`;
  const audioPath = `${viewPath}/audio/${audioParamsPattern}`;
  return {
    rootPath: path,
    addPath,
    viewPath,
    editPath,
    audioPath,
    rootUrl: generatePath(path, params),
    addUrl: generatePath(addPath, params),
    viewUrl: (id) => generatePath(viewPath, { ...params, [idParam]: id }),
    editUrl: (id) => generatePath(editPath, { ...params, [idParam]: id }),
    audioUrl: ({ id, ...audioParams }) =>
      generatePath(audioPath, { ...params, ...audioParams, [idParam]: id }),
  };
}
