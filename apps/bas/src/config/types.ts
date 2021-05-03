// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>
export type ButtonEventFunction = (event: ButtonEvent) => void

// Election
export interface CardAbsentAPI {
  present: false
}
export interface CardPresentAPI {
  present: true
  shortValue: string
  longValueExists?: boolean
}
export type CardAPI = CardAbsentAPI | CardPresentAPI
