import {
  GetConfigResponse,
  PatchConfigResponse,
  PatchConfigRequest,
} from '../config/types'
import fetchJSON from '../util/fetchJSON'

export async function get(): Promise<GetConfigResponse> {
  return fetchJSON<GetConfigResponse>('/config')
}

export async function patch(config: PatchConfigRequest): Promise<void> {
  const response = await fetchJSON<PatchConfigResponse>('/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
    headers: { 'Content-Type': 'application/json' },
  })

  if (response.status !== 'ok') {
    throw new Error(`failed with response status: ${response.status}`)
  }
}
