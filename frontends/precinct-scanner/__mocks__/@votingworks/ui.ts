// eslint-disable-next-line import/no-extraneous-dependencies
import {
  fakePrintElementWhenReady,
  fakePrintElement,
} from '@votingworks/test-utils';

const ui = jest.requireActual('@votingworks/ui');

// eslint-disable-next-line vx/gts-no-default-exports
export default {
  ...ui,
  printElement: fakePrintElement,
  printElementWhenReady: fakePrintElementWhenReady,
};
