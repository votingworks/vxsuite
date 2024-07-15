/* istanbul ignore file */

import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { H1, H4, Prose, Select } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import React, { useRef, useState } from 'react';
import { BrowserRouter, Link, Route } from 'react-router-dom';
import styled from 'styled-components';
import { createApiClient } from './api';
import { Paths } from './constants';
import { VoterSettingsScreen } from './screens/voter_settings_screen';
import { ApiProvider } from './api_provider';

interface PreviewContextValues {
  electionDefinition: ElectionDefinition;
}

const PreviewContext = React.createContext<PreviewContextValues | undefined>(
  undefined
);

export function usePreviewContext(): PreviewContextValues {
  const context = React.useContext(PreviewContext);
  assert(context, 'PreviewContext.Provider not found');
  return context;
}

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

  const onElectionDefinitionSelected: React.ChangeEventHandler<
    HTMLSelectElement
  > = (event) => {
    const { value } = event.target.selectedOptions[0];
    if (value === 'custom') {
      electionDefinitionFileRef.current?.click();
    } else {
      setElectionDefinition(electionDefinitions[event.target.selectedIndex]);
    }
  };
  const onElectionDefinitionFileChosen: React.ChangeEventHandler<
    HTMLInputElement
  > = async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const json = await file.text();
      const result = safeParseElectionDefinition(json);
      if (result.isOk()) {
        setElectionDefinitions((prev) => [...prev, result.ok()]);
        setElectionDefinition(result.ok());
      }
    }
  };

  return (
    <PreviewContext.Provider value={{ electionDefinition }}>
      <ApiProvider apiClient={createApiClient()} enableStringTranslation>
        <BrowserRouter>
          <Route path={Paths.VOTER_SETTINGS} exact>
            <VoterSettingsScreen />
          </Route>
          <Route path="/preview" exact>
            <div style={{ height: '100%', overflow: 'auto' }}>
              <H1>Previews</H1>
              <PreviewColumns>
                {previewables.map(({ componentName, previews }) => {
                  return (
                    <Prose key={componentName}>
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
                    </Prose>
                  );
                })}
              </PreviewColumns>
              <ConfigBox>
                <Select
                  value={electionDefinition.ballotHash}
                  onChange={onElectionDefinitionSelected}
                >
                  <optgroup label="Presets">
                    {initialElectionDefinitions.map(
                      ({ election, ballotHash }) => (
                        <option key={ballotHash} value={ballotHash}>
                          {election.title}
                        </option>
                      )
                    )}
                  </optgroup>
                  <optgroup label="Custom">
                    {electionDefinitions
                      .slice(initialElectionDefinitions.length)
                      .map(({ election, ballotHash }) => (
                        <option key={ballotHash} value={ballotHash}>
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
    </PreviewContext.Provider>
  );
}
