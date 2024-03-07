import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../../test/react_testing_library';
import { TabBar } from './tab_bar';
import { SettingsPaneId } from './types';

test('renders all available voter settings tabs', () => {
  render(<TabBar activePaneId="voterSettingsSize" onChange={jest.fn()} />);

  const tabList = screen.getByRole('tablist', { name: 'Settings' });
  within(tabList).getByRole('tab', { name: 'Color', selected: false });
  within(tabList).getByRole('tab', { name: 'Text Size', selected: true });
});

test('fires change event with settings pane id', () => {
  const onChange = jest.fn();
  render(
    <TabBar
      activePaneId="voterSettingsSize"
      onChange={onChange}
      allowAudioVideoOnlyToggles
    />
  );

  expect(onChange).not.toHaveBeenCalled();

  userEvent.click(screen.getByRole('tab', { name: 'Color', selected: false }));

  expect(onChange).toHaveBeenCalledWith<[SettingsPaneId]>('voterSettingsColor');

  userEvent.click(screen.getByRole('tab', { name: 'Audio', selected: false }));

  expect(onChange).toHaveBeenCalledWith<[SettingsPaneId]>('voterSettingsAudio');
});
