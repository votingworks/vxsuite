import { render } from '@testing-library/react';

import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  renderWithThemes,
  vxTestingLibraryScreen,
  vxTestingLibraryWithinFn,
} from './render_with_themes';
import { H1, P } from '../typography';
import { makeTheme } from './make_theme';
import { Button } from '../button';

test('renders theme-dependent component successfully', () => {
  suppressingConsoleOutput(() =>
    expect(() =>
      render(
        <div>
          <H1>This component requires a styled-components theme context.</H1>
          <P>So does this one.</P>
        </div>
      )
    ).toThrow()
  );

  expect(() =>
    renderWithThemes(
      <div>
        <H1>This component requires a styled-components theme context.</H1>
        <P>So does this one.</P>
      </div>
    )
  ).not.toThrow();
});

test('renders with specified theme settings', () => {
  const lowContrastTheme = makeTheme({
    colorMode: 'contrastLow',
    sizeMode: 'xl',
  });

  const { getByText } = renderWithThemes(<P color="warning">Warning text</P>, {
    vxTheme: {
      colorMode: 'contrastLow',
      sizeMode: 'xl',
    },
  });

  expect(getByText('Warning text')).toHaveStyle({
    color: lowContrastTheme.colors.accentWarning,
  });
});

describe('RenderResult API', () => {
  test('getButton()', () => {
    const { getByRole, getButton } = renderWithThemes(
      <div>
        <Button onPress={jest.fn()}>Ignore me</Button>
        <Button onPress={jest.fn()}>Find me</Button>
      </div>
    );

    const expectedButton = getByRole('button', { name: 'Find me' });
    const foundButton = getButton('Find me');
    expect(foundButton).toEqual(expectedButton);

    const otherButton = getButton('Ignore me');
    expect(otherButton).not.toBe(foundButton);
  });

  test('getAllButtons()', () => {
    const { getAllByRole, getAllButtons } = renderWithThemes(
      <div>
        <Button onPress={jest.fn()} disabled>
          Find us both
        </Button>
        <Button onPress={jest.fn()}>Ignore me</Button>
        <Button variant="primary" onPress={jest.fn()}>
          Find us both
        </Button>
      </div>
    );

    const expectedButtons = getAllByRole('button', { name: 'Find us both' });
    const foundButtons = getAllButtons('Find us both');
    expect(foundButtons).toHaveLength(2);
    expect(foundButtons).toEqual(expectedButtons);
  });

  test('findButton()', async () => {
    const { findByRole, findButton } = renderWithThemes(
      <div>
        <Button onPress={jest.fn()}>Ignore me</Button>
        <Button onPress={jest.fn()}>Find me</Button>
      </div>
    );

    const expectedButton = await findByRole('button', { name: 'Find me' });
    const foundButton = await findButton('Find me');

    expect(foundButton).toEqual(expectedButton);

    const otherButton = await findButton('Ignore me');
    expect(otherButton).not.toBe(foundButton);
  });

  test('findAllButtons()', async () => {
    const { findAllByRole, findAllButtons } = renderWithThemes(
      <div>
        <Button onPress={jest.fn()} disabled>
          Find us both
        </Button>
        <Button onPress={jest.fn()}>Ignore me</Button>
        <Button variant="primary" onPress={jest.fn()}>
          Find us both
        </Button>
      </div>
    );

    const expectedButtons = await findAllByRole('button', {
      name: 'Find us both',
    });
    const foundButtons = await findAllButtons('Find us both');
    expect(foundButtons).toHaveLength(2);
    expect(foundButtons).toEqual(expectedButtons);
  });

  test('useSparinglyIncludeHidden option includes hidden buttons', async () => {
    const { getAllButtons, getButton, findAllButtons, findButton } =
      renderWithThemes(
        <div>
          <Button onPress={jest.fn()}>Visible Button</Button>
          <div aria-hidden>
            <Button onPress={jest.fn()}>Hidden Button</Button>
          </div>
        </div>
      );

    expect(getAllButtons(/.+ Button/)).toHaveLength(1);
    expect(
      getAllButtons(/.+ Button/, { useSparinglyIncludeHidden: true })
    ).toHaveLength(2);

    expect(await findAllButtons(/.+ Button/)).toHaveLength(1);
    expect(
      await findAllButtons(/.+ Button/, { useSparinglyIncludeHidden: true })
    ).toHaveLength(2);

    expect(() => getButton('Hidden Button')).toThrow();
    expect(() =>
      getButton('Hidden Button', { useSparinglyIncludeHidden: true })
    ).not.toThrow();

    await expect(
      async () => await findButton('Hidden Button')
    ).rejects.toThrow();
    expect(
      await findButton('Hidden Button', { useSparinglyIncludeHidden: true })
    ).toBeDefined();
  });
});

describe('screen API', () => {
  test('getButton()', () => {
    const { getButton, getByRole } = vxTestingLibraryScreen;

    renderWithThemes(
      <div>
        <Button onPress={jest.fn()}>Ignore me</Button>
        <Button onPress={jest.fn()}>Find me</Button>
      </div>
    );

    const expectedButton = getByRole('button', { name: 'Find me' });
    const foundButton = getButton('Find me');
    expect(foundButton).toEqual(expectedButton);

    const otherButton = getButton('Ignore me');
    expect(otherButton).not.toBe(foundButton);
  });
});

describe('within() API', () => {
  test('getButton()', () => {
    const result = renderWithThemes(
      <div>
        <Button onPress={jest.fn()}>Non-Modal Button</Button>
        <div role="alertdialog">
          <Button onPress={jest.fn()}>Modal Button</Button>
        </div>
      </div>
    );

    const testModal = result.getByRole('alertdialog');
    const withinModal = vxTestingLibraryWithinFn(testModal);

    const expectedModalButton = withinModal.getByRole('button', {
      name: 'Modal Button',
    });
    const foundModalButton = withinModal.getButton('Modal Button');
    expect(foundModalButton).toEqual(expectedModalButton);

    expect(() => withinModal.getButton('Non-Modal Button')).toThrow();
  });
});
