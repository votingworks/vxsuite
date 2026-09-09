import { expect, test } from 'vitest';

import { ElectionStringKey } from '@votingworks/types';

import { UiStringPreview } from './ui_string_preview.js';
import { render, screen } from '../../test/react_testing_library.js';

test('renders contest description as rich text', async () => {
  render(
    <UiStringPreview
      stringKey={ElectionStringKey.CONTEST_DESCRIPTION}
      text="<p>Shall the town <strong>approve</strong> the measure?</p>"
    />
  );

  await screen.findByText('approve');
});

test('sanitizes contest description HTML', () => {
  const { container } = render(
    <UiStringPreview
      stringKey={ElectionStringKey.CONTEST_DESCRIPTION}
      text={`<p>Shall the town...</p><img src="x" onerror="document.title='pwned'">`}
    />
  );

  expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});

test('renders other strings as plain text', async () => {
  render(
    <UiStringPreview
      stringKey={ElectionStringKey.CONTEST_TITLE}
      text="<p>Not rich text</p>"
    />
  );

  await screen.findByText('<p>Not rich text</p>');
});
