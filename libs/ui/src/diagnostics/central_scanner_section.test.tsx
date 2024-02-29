import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { render } from '../../test/react_testing_library';
import { CentralScannerSection } from './central_scanner_section';

test('connected', async () => {
  render(<CentralScannerSection isScannerAttached />);

  await expectTextWithIcon('Connected', 'square-check');
});

test('not connected', async () => {
  render(<CentralScannerSection isScannerAttached={false} />);

  await expectTextWithIcon('No scanner detected', 'circle-info');
});
