import { generatePath, useRouteMatch } from 'react-router-dom';

export interface EditModeRoutes {
  readonly isEditing: boolean;
  readonly viewUrl: string;
  readonly editUrl: string;
}

export function useEditModeRoutes(): EditModeRoutes {
  const { path, params } = useRouteMatch();
  const editPath = `${path}/edit`;
  return {
    isEditing: useRouteMatch(editPath) !== null,
    viewUrl: generatePath(path, params),
    editUrl: generatePath(editPath, params),
  };
}
