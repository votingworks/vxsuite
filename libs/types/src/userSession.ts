import { CardDataTypes } from './election'

export interface UserSession {
  readonly type: CardDataTypes
  readonly authenticated: boolean
}
