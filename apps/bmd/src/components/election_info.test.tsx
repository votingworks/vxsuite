import React from 'react';
import { render } from '@testing-library/react';

import { PrecinctIdSchema, unsafeParse } from '@votingworks/types';
import { ElectionInfo } from './election_info';
import { electionSampleWithSealDefinition as electionDefinition } from '../data';
import { PrecinctSelectionKind } from '../config/types';

it('renders horizontal ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: unsafeParse(PrecinctIdSchema, '23'),
      }}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
  expect(container).toMatchSnapshot();
});

it('renders horizontal ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: unsafeParse(PrecinctIdSchema, '23'),
      }}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
  expect(container).toMatchSnapshot();
});

it('renders vertical ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: unsafeParse(PrecinctIdSchema, '23'),
      }}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});

it('renders vertical ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: unsafeParse(PrecinctIdSchema, '23'),
      }}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});
