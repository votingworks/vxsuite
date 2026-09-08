import userEventDefault from '@testing-library/user-event';

/**
 * The type of `userEvent`, which the package declares only as its default
 * export. Read through the module namespace so this resolves under ESM.
 */
type UserEvent = NonNullable<(typeof userEventDefault)['default']>;

const userEventModule = userEventDefault as unknown as UserEvent & {
  default?: UserEvent;
};

/**
 * `userEvent` from @testing-library/user-event, normalized across module
 * systems — the same interop dance as `./styled.ts`.
 *
 * user-event v13 ships CommonJS only, so node's ESM interop makes the default
 * import `module.exports` and the real `userEvent` is its `default` property.
 * Vitest applies its own `interopDefault` and hands us `userEvent` itself.
 * Accept whichever we were given.
 */
export const userEvent: UserEvent = userEventModule.default ?? userEventModule;
