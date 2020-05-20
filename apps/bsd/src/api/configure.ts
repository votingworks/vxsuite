import { Election, ConfigureResponse } from '../config/types'
import fetchJSON from '../util/fetchJSON'

export default async function configure(election: Election): Promise<void> {
  const response = await fetchJSON<ConfigureResponse>('/scan/configure', {
    method: 'post',
    body: JSON.stringify(election),
  })

  if (response.status !== 'ok') {
    throw new Error(`configure failed with response status: ${response.status}`)
  }
}
