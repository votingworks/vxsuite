import {
  type MockPaperHandlerStatus,
  type PaperHandlerDriverInterface,
  isMockPaperHandler,
} from '@votingworks/custom-paper-handler';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildMockPaperHandlerApi(params: {
  paperHandler?: PaperHandlerDriverInterface;
}) {
  const { paperHandler } = params;

  return {
    setMockPaperHandlerStatus(input: {
      mockStatus: MockPaperHandlerStatus;
    }): void {
      if (!isMockPaperHandler(paperHandler)) {
        return;
      }

      paperHandler.setMockStatus(input.mockStatus);
    },
  };
}
