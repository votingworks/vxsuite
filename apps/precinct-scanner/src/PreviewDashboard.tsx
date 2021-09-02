/* istanbul ignore file */

import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types'
import { Select } from '@votingworks/ui'
import React, { useCallback, useRef, useState } from 'react'
import { BrowserRouter, Link, Route } from 'react-router-dom'
import styled from 'styled-components'
import AppContext from './contexts/AppContext'

export interface PreviewableModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: React.FC<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: React.FC<any>
}

export interface PreviewableComponent {
  componentId: string
  componentName: string
  previews: readonly ComponentPreview[]
}

export interface ComponentPreview {
  componentId: string
  componentName: string
  previewId: string
  previewName: string
  previewComponent: React.FC<unknown>
}

export const PREVIEW_COMPONENT_SUFFIX = 'Preview'

function asTitle(id: string): string {
  return id.split(/(?=[A-Z\d]+)/).join(' ')
}

function getPreviewURL(preview: ComponentPreview): string {
  return `/preview/${preview.componentId}/${preview.previewId}`
}

export function getPreviews(mod: PreviewableModule): PreviewableComponent {
  const componentId = mod.default.name
  const previews = Object.keys(mod)
    .filter((key) => key.endsWith(PREVIEW_COMPONENT_SUFFIX))
    .map((previewId) => ({
      componentId,
      componentName: asTitle(componentId),
      previewId,
      previewName: asTitle(
        previewId.slice(0, -PREVIEW_COMPONENT_SUFFIX.length)
      ),
      previewComponent: mod[previewId],
    }))
  return { componentId, componentName: asTitle(componentId), previews }
}

export interface Props {
  modules: readonly PreviewableModule[]
  electionDefinitions: readonly ElectionDefinition[]
}

const ConfigBox = styled.div`
  position: absolute;
  top: 20px;
  right: 10px;
  width: auto;
`

const PreviewDashboard = ({
  modules,
  electionDefinitions: initialElectionDefinitions,
}: Props): JSX.Element => {
  const previewables = modules.map(getPreviews)
  const [electionDefinition, setElectionDefinition] = useState(
    initialElectionDefinitions[0]
  )
  const [electionDefinitions, setElectionDefinitions] = useState(
    initialElectionDefinitions
  )
  const electionDefinitionFileRef = useRef<HTMLInputElement>(null)

  const onElectionDefinitionSelected: React.ChangeEventHandler<HTMLSelectElement> = useCallback(
    (event) => {
      const { value } = event.target.selectedOptions[0]
      if (value === 'custom') {
        electionDefinitionFileRef.current?.click()
      } else {
        setElectionDefinition(electionDefinitions[event.target.selectedIndex])
      }
    },
    [electionDefinitions, electionDefinitionFileRef]
  )
  const onElectionDefinitionFileChosen: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      if (file) {
        const json = await file.text()
        const result = safeParseElectionDefinition(json)
        if (result.isOk()) {
          setElectionDefinitions((prev) => [...prev, result.ok()])
          setElectionDefinition(result.ok())
        }
      }
    },
    []
  )

  return (
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'preview',
          machineId: '000',
        },
        electionDefinition,
      }}
    >
      <BrowserRouter>
        <Route path="/preview" exact>
          <h1>Previews</h1>
          <div style={{ columns: '3' }}>
            {previewables.map(({ componentName, previews }) => (
              <div key={componentName} style={{ breakInside: 'avoid' }}>
                <h4 style={{ marginBottom: '2px' }}>{componentName}</h4>
                <ul style={{ marginTop: '0' }}>
                  {previews.map((preview) => (
                    <li key={preview.previewName}>
                      <Link to={getPreviewURL(preview)}>
                        {preview.previewName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
              path={getPreviewURL(preview)}
              component={preview.previewComponent}
            />
          ))
        )}
      </BrowserRouter>
    </AppContext.Provider>
  )
}

export default PreviewDashboard
