import { Election, parseElection } from '@votingworks/types'
import { ElectionDefinition } from '../types'
import { createHash } from 'crypto'
import type * as z from 'zod'

export function hash(electionData: string): string {
  return createHash('sha256').update(electionData).digest('hex')
}

export function fromElection(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election)
  const electionHash = hash(electionData)
  return { election, electionData, electionHash }
}

export enum ValidationErrorType {
  JSONMismatch = 'JSONMismatch',
  HashMismatch = 'HashMismatch',
  InvalidSchema = 'InvalidSchema',
}

export type ValidationError =
  | { type: ValidationErrorType.JSONMismatch; actual: string; expected: string }
  | { type: ValidationErrorType.HashMismatch; actual: string; expected: string }
  | { type: ValidationErrorType.InvalidSchema; error: z.ZodError }

export function* validate(
  electionDefinition: ElectionDefinition
): Generator<ValidationError> {
  const actualJSON = JSON.stringify(JSON.parse(electionDefinition.electionData))
  const expectedJSON = JSON.stringify(electionDefinition.election)
  if (expectedJSON !== actualJSON) {
    yield {
      type: ValidationErrorType.JSONMismatch,
      actual: actualJSON,
      expected: expectedJSON,
    }
  }

  const actualHash = electionDefinition.electionHash
  const expectedHash = hash(electionDefinition.electionData)
  if (expectedHash !== actualHash) {
    yield {
      type: ValidationErrorType.HashMismatch,
      actual: actualHash,
      expected: expectedHash,
    }
  }

  try {
    parseElection(electionDefinition.election)
  } catch (error) {
    yield {
      type: ValidationErrorType.InvalidSchema,
      error,
    }
  }
}
