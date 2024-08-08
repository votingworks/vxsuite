import {
  BallotMetadata,
  PageInterpretation,
  PageInterpretationType,
} from '@votingworks/types';
import { mockOf, suppressingConsoleOutput } from '@votingworks/test-utils';
import { TestErrorBoundary } from '@votingworks/ui';
import { UseQueryResult } from '@tanstack/react-query';
import { render, screen } from '../../test/react_testing_library';
import { InsertedInvalidNewSheetScreen } from './inserted_invalid_new_sheet_screen';
import * as api from '../api';

jest.mock('../api');

function setMockInterpretationQuery(params: {
  isSuccess: boolean;
  metadata?: Partial<BallotMetadata>;
  type?: PageInterpretationType;
}) {
  const { isSuccess, metadata, type } = params;

  mockOf(api.getInterpretation.useQuery).mockReturnValue({
    data: {
      metadata: metadata as unknown as BallotMetadata,
      type,
    } as unknown as PageInterpretation,
    isSuccess,
  } as unknown as UseQueryResult<PageInterpretation>);
}

function setMockInterpretation(type: PageInterpretationType) {
  setMockInterpretationQuery({
    isSuccess: true,
    metadata: { isTestMode: true },
    type,
  });
}

const expectedScreenContents: Readonly<
  Record<PageInterpretationType, string | RegExp>
> = {
  BlankPage: /no ballot detected/i,
  InterpretedBmdPage: 'Test Error Boundary',
  InterpretedHmpbPage: /unable to read ballot/i,
  InvalidBallotHashPage: /wrong election/i,
  InvalidPrecinctPage: /wrong precinct/i,
  InvalidTestModePage: /wrong ballot mode/i,
  UnreadablePage: /unable to read ballot/i,
};

for (const [interpretationType, expectedString] of Object.entries(
  expectedScreenContents
) as Array<[PageInterpretationType, string]>) {
  test(`'${interpretationType}' interpretation type`, () => {
    suppressingConsoleOutput(() => {
      setMockInterpretation(interpretationType);

      render(
        <TestErrorBoundary>
          <InsertedInvalidNewSheetScreen />
        </TestErrorBoundary>
      );

      screen.getByText(expectedString);
    });
  });
}

test('no contents while query is pending', () => {
  setMockInterpretationQuery({ isSuccess: false });

  const { container } = render(
    <TestErrorBoundary>
      <InsertedInvalidNewSheetScreen />
    </TestErrorBoundary>
  );

  expect(container).toHaveTextContent('');
});
