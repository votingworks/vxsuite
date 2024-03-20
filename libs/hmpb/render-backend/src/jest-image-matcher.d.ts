/* eslint-disable no-restricted-globals */
// eslint-disable-next-line vx/gts-module-snake-case
declare module 'jest-image-matcher' {
  export function toMatchImage(
    this: MatcherContext,
    received: Buffer,
    ...actual: Buffer[]
  ): CustomMatcherResult;
}
