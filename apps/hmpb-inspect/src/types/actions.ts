import { Rect } from '../types'

export type RootAction = Landmark | Group | Search
export type SearchAction =
  | RootAction
  | SearchTest
  | SearchAdd
  | SearchUpdate
  | SearchCommit
  | SearchCancel
export type AnyAction = SearchAction

export interface Landmark {
  readonly kind: 'landmark'
  readonly type: string
  readonly bounds: Rect
  readonly comment?: string
}

export interface Group {
  readonly kind: 'group'
  readonly name: string
  readonly actions: readonly RootAction[]
  readonly comment?: string
}

export interface Search {
  readonly kind: 'search'
  readonly type: string
  readonly actions: readonly SearchAction[]
  readonly comment?: string
}

export interface SearchTest {
  readonly kind: 'search-test'
  readonly bounds: Rect
  readonly comment?: string
}

export interface SearchAdd {
  readonly kind: 'search-add'
  readonly bounds: Rect
  readonly comment?: string
}

export interface SearchUpdate {
  readonly kind: 'search-update'
  readonly bounds: Rect
  readonly comment?: string
}

export interface SearchCommit {
  readonly kind: 'search-commiit'
  readonly comment?: string
}

export interface SearchCancel {
  readonly kind: 'search-cancel'
  readonly comment?: string
}
