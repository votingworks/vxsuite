import userEvent from '@testing-library/user-event';
import { SyntheticEvent } from 'react';
import { buttonPressEventMatcher } from '@votingworks/test-utils';
import { render, screen, within } from '../../test/react_testing_library';
import { TabBar } from './tab_bar';
import { SettingsPaneId } from './types';

test('renders all available display settings tabs', () => {
  render(<TabBar activePaneId="displaySettingsSize" onChange={jest.fn()} />);

  const tabList = screen.getByRole('tablist', { name: 'Display settings' });
  within(tabList).getByRole('tab', { name: 'Color', selected: false });
  within(tabList).getByRole('tab', { name: 'Text Size', selected: true });
});

test('fires change event with settings pane id', () => {
  const onChange = jest.fn();
  render(<TabBar activePaneId="displaySettingsSize" onChange={onChange} />);

  expect(onChange).not.toHaveBeenCalled();

  userEvent.click(screen.getByRole('tab', { name: 'Color', selected: false }));

  expect(onChange).toHaveBeenCalledWith<[SettingsPaneId, SyntheticEvent]>(
    'displaySettingsColor',
    buttonPressEventMatcher()
  );
});
