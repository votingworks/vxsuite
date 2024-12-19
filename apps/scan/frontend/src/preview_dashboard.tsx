/* istanbul ignore file - @preserve */

import { H1, H4 } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import React from 'react';
import { BrowserRouter, Link, Route } from 'react-router-dom';
import styled from 'styled-components';
import { createApiClient } from './api';
import { Paths } from './constants';
import { VoterSettingsScreen } from './screens/voter_settings_screen';
import { ApiProvider } from './api_provider';

const PreviewColumns = styled.div`
  columns: 2;

  @media (orientation: landscape) {
    columns: 3;
  }

  & > div {
    margin-bottom: 2rem;
    break-inside: avoid;
  }
`;

export interface PreviewableModule {
  [key: string]: unknown;
}

export interface PreviewableComponent {
  componentId: string;
  componentName: string;
  previews: readonly ComponentPreview[];
}

export interface ComponentPreview {
  componentId: string;
  componentName: string;
  previewId: string;
  previewName: string;
  previewComponent: React.FC<unknown>;
}

export const PREVIEW_COMPONENT_SUFFIX = 'Preview';

function asTitle(id: string): string {
  return id.split(/(?=[A-Z\d]+)/).join(' ');
}

function getPreviewUrl(preview: ComponentPreview): string {
  return `/preview/${preview.componentId}/${preview.previewId}`;
}

function extractComponents(mod: PreviewableModule): Array<React.FC<unknown>> {
  return Object.entries(mod).flatMap<React.FC<unknown>>(
    ([exportName, exportValue]) =>
      typeof exportValue === 'function' &&
      exportValue.name === exportName &&
      /^[A-Z][a-zA-Z0-9]+$/.test(exportName)
        ? (exportValue as React.FC<unknown>)
        : []
  );
}

export function getPreviews(
  mod: PreviewableModule
): PreviewableComponent | undefined {
  const components = extractComponents(mod);
  const previewComponents = components.filter((component) =>
    component.name.endsWith(PREVIEW_COMPONENT_SUFFIX)
  );
  const nonPreviewComponents = components.filter(
    (component) => !component.name.endsWith(PREVIEW_COMPONENT_SUFFIX)
  );

  if (nonPreviewComponents.length === 0 || previewComponents.length === 0) {
    return;
  }

  assert(nonPreviewComponents.length === 1);
  const [previewableComponent] = nonPreviewComponents;
  const componentId = previewableComponent.name;
  const componentName = asTitle(previewableComponent.name);
  const previews = previewComponents.map((previewComponent) => ({
    componentId,
    componentName,
    previewId: previewComponent.name,
    previewName: asTitle(
      previewComponent.name.slice(0, -PREVIEW_COMPONENT_SUFFIX.length)
    ),
    previewComponent,
  }));

  return { componentId, componentName, previews };
}

export interface Props {
  modules: readonly PreviewableModule[];
}

export function PreviewDashboard({ modules }: Props): JSX.Element {
  const previewables = modules.flatMap((mod) => getPreviews(mod) ?? []);

  return (
    <ApiProvider apiClient={createApiClient()} enableStringTranslation>
      <BrowserRouter>
        <Route path={Paths.VOTER_SETTINGS} exact>
          <VoterSettingsScreen />
        </Route>
        <Route path="/preview" exact>
          <div style={{ height: '100%', overflow: 'auto' }}>
            <H1>Previews</H1>
            <PreviewColumns>
              {previewables.map(({ componentName, previews }) => (
                <div key={componentName}>
                  <H4>{componentName}</H4>
                  <ul>
                    {previews.map((preview) => (
                      <li key={preview.previewName}>
                        <Link to={getPreviewUrl(preview)}>
                          {preview.previewName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </PreviewColumns>
          </div>
        </Route>
        {previewables.map((previewable) =>
          previewable.previews.map((preview) => (
            <Route
              key={preview.previewName}
              path={getPreviewUrl(preview)}
              component={preview.previewComponent}
            />
          ))
        )}
      </BrowserRouter>
    </ApiProvider>
  );
}
