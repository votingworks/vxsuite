import { CardDataTypes } from './election'

export interface UserSession {
  readonly type: CardDataTypes | 'invalid'
  readonly authenticated: boolean
}
