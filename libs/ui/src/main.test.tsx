import { render, screen } from '../test/react_testing_library';
import { Main, MainContent, MainHeader } from './main';

describe('renders Main', () => {
  test('with defaults', () => {
    const { container } = render(<Main>Main</Main>);
    const main = container.firstChild;
    expect(main).not.toHaveStyleRule('display');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).not.toHaveStyleRule('flex-direction');
    expect(main).not.toHaveStyleRule('justify-content');
    expect(main).not.toHaveStyleRule('align-items');
    expect(main).toHaveStyleRule('padding', '0rem');
    expect(main).toHaveStyleRule('overflow', 'auto');
  });

  test('with padding and centered child', () => {
    const { container } = render(
      <Main padded centerChild>
        Main
      </Main>
    );
    const main = container.firstChild;
    expect(main).toHaveStyleRule('display', 'flex');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).toHaveStyleRule('flex-direction', 'column');
    expect(main).toHaveStyleRule('justify-content', 'center');
    expect(main).toHaveStyleRule('align-items', 'center');
    expect(main).toHaveStyleRule('padding', '0.5rem');
  });

  test('as a flexRow', () => {
    const { container } = render(<Main flexRow>Main</Main>);
    const main = container.firstChild;
    expect(main).toHaveStyleRule('display', 'flex');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).not.toHaveStyleRule('flex-direction');
    expect(main).not.toHaveStyleRule('justify-content');
    expect(main).not.toHaveStyleRule('align-items');
  });

  test('as a flexColumn', () => {
    const { container } = render(<Main flexColumn>Main</Main>);
    const main = container.firstChild;
    expect(main).toHaveStyleRule('display', 'flex');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).toHaveStyleRule('flex-direction', 'column');
    expect(main).not.toHaveStyleRule('justify-content');
    expect(main).not.toHaveStyleRule('align-items');
  });

  test('with header and content', () => {
    const { container } = render(
      <Main flexColumn>
        <MainHeader>Header</MainHeader>
        <MainContent>Content</MainContent>
      </Main>
    );
    const main = container.firstChild;
    const header = screen.getByText('Header');
    const content = screen.getByText('Content');
    expect(main).toHaveStyleRule('position', 'relative');
    expect(header).toHaveStyleRule('position', 'sticky');
    expect(content).toHaveStyleRule('overflow', 'auto');
  });
});
