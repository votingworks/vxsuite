/* istanbul ignore file */

import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { Select } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import React, { useCallback, useRef, useState } from 'react';
import { BrowserRouter, Link, Route } from 'react-router-dom';
import styled from 'styled-components';
import { AppContext } from './contexts/app_context';

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
  electionDefinitions: readonly ElectionDefinition[];
}

const ConfigBox = styled.div`
  position: absolute;
  top: 20px;
  right: 10px;
  width: auto;
`;

export function PreviewDashboard({
  modules,
  electionDefinitions: initialElectionDefinitions,
}: Props): JSX.Element {
  const previewables = modules.flatMap((mod) => getPreviews(mod) ?? []);
  const [electionDefinition, setElectionDefinition] = useState(
    initialElectionDefinitions[0]
  );
  const [electionDefinitions, setElectionDefinitions] = useState(
    initialElectionDefinitions
  );
  const electionDefinitionFileRef = useRef<HTMLInputElement>(null);

  const onElectionDefinitionSelected: React.ChangeEventHandler<HTMLSelectElement> =
    useCallback(
      (event) => {
        const { value } = event.target.selectedOptions[0];
        if (value === 'custom') {
          electionDefinitionFileRef.current?.click();
        } else {
          setElectionDefinition(
            electionDefinitions[event.target.selectedIndex]
          );
        }
      },
      [electionDefinitions, electionDefinitionFileRef]
    );
  const onElectionDefinitionFileChosen: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(async (event) => {
      const file = event.target.files?.[0];
      if (file) {
        const json = await file.text();
        const result = safeParseElectionDefinition(json);
        if (result.isOk()) {
          setElectionDefinitions((prev) => [...prev, result.ok()]);
          setElectionDefinition(result.ok());
        }
      }
    }, []);

  return (
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'preview',
          machineId: '000',
          bypassAuthentication: false,
        },
        electionDefinition,
      }}
    >
      <BrowserRouter>
        <Route path="/preview" exact>
          <h1>Previews</h1>
          <div style={{ columns: '3' }}>
            {previewables.map(({ componentName, previews }) => {
              return (
                <div key={componentName} style={{ breakInside: 'avoid' }}>
                  <h4 style={{ marginBottom: '2px' }}>{componentName}</h4>
                  <ul style={{ marginTop: '0' }}>
                    {previews.map((preview) => (
                      <li key={preview.previewName}>
                        <Link to={getPreviewUrl(preview)}>
                          {preview.previewName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <ConfigBox>
            <Select
              value={electionDefinition.electionHash}
              onChange={onElectionDefinitionSelected}
            >
              <optgroup label="Presets">
                {initialElectionDefinitions.map(
                  ({ election, electionHash }) => (
                    <option key={electionHash} value={electionHash}>
                      {election.title}
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label="Custom">
                {electionDefinitions
                  .slice(initialElectionDefinitions.length)
                  .map(({ election, electionHash }) => (
                    <option key={electionHash} value={electionHash}>
                      {election.title}
                    </option>
                  ))}
                <option value="custom">Load from file…</option>
              </optgroup>
            </Select>
            <input
              ref={electionDefinitionFileRef}
              style={{ display: 'none' }}
              type="file"
              onChange={onElectionDefinitionFileChosen}
            />
          </ConfigBox>
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
    </AppContext.Provider>
  );
}
