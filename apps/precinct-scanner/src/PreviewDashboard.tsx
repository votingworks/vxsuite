/* istanbul ignore file */

import { electionSampleDefinition } from '@votingworks/fixtures'
import React from 'react'
import { BrowserRouter, Link, Route } from 'react-router-dom'
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
  return id.split(/(?=[A-Z])/).join(' ')
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
}

const PreviewDashboard: React.FC<Props> = ({ modules }) => {
  const previewables = modules.map(getPreviews)

  return (
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'preview',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <BrowserRouter>
        <Route path="/preview" exact>
          <h1>Previews</h1>
          {previewables.map(({ componentName, previews }) => {
            return (
              <React.Fragment key={componentName}>
                <h2>{componentName}</h2>
                <ul>
                  {previews.map((preview) => (
                    <li key={preview.previewName}>
                      <Link to={getPreviewURL(preview)}>
                        {preview.previewName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </React.Fragment>
            )
          })}
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
