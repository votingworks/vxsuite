declare global {
  // eslint-disable-next-line no-var, vars-on-top
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// React only performs its act(...) checks when this flag is set, and only warns
// that an update wasn't wrapped in act(...) while it's true. React Testing
// Library sets it in a `beforeAll`, but only when the test runner injects
// globals — which vitest doesn't do here (`globals` is left at its default), so
// without this the checks are silently disabled everywhere.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
