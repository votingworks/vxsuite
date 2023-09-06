import { render } from '../test/react_testing_library';

import { HandMarkedPaperBallotProse } from './hand_marked_paper_ballot_prose';

describe('renders HandMarkedPaperBallotProse', () => {
  test('with defaults', () => {
    const { container } = render(<HandMarkedPaperBallotProse />);
    const prose = container.firstChild;
    expect(prose).toHaveStyleRule('line-height', '1.1');
  });

  test('horizontal rule is black', () => {
    const { container } = render(<HandMarkedPaperBallotProse />);
    const prose = container.firstChild;
    const hr = { modifier: '& hr' } as const;
    expect(prose).toHaveStyleRule('border-top', '0.1em solid #000', hr);
  });

  test('with compact spacing', () => {
    const { container } = render(<HandMarkedPaperBallotProse compact />);
    const prose = container.firstChild;
    const p = { modifier: '& p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '0', p);
    expect(prose).toHaveStyleRule('margin-bottom', '0', p);

    const pAfterHeading = { modifier: '& h3 + p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '0', pAfterHeading);
  });

  test('with density 0', () => {
    const { container } = render(<HandMarkedPaperBallotProse density={0} />);
    const prose = container.firstChild;
    const p = { modifier: '& p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '1em', p);
    expect(prose).toHaveStyleRule('margin-bottom', '1em', p);

    const pAfterHeading = { modifier: '& h3 + p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '-1em', pAfterHeading);
  });

  test('with density 1', () => {
    const { container } = render(<HandMarkedPaperBallotProse density={1} />);
    const prose = container.firstChild;
    const p = { modifier: '& p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '0.5em', p);
    expect(prose).toHaveStyleRule('margin-bottom', '0.5em', p);

    const pAfterHeading = { modifier: '& h3 + p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '-0.75em', pAfterHeading);
  });

  test('with density 2', () => {
    const { container } = render(<HandMarkedPaperBallotProse density={2} />);
    const prose = container.firstChild;
    const p = { modifier: '& p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '0.25em', p);
    expect(prose).toHaveStyleRule('margin-bottom', '0.25em', p);

    const pAfterHeading = { modifier: '& h3 + p' } as const;
    expect(prose).toHaveStyleRule('margin-top', '-0.5em', pAfterHeading);
  });
});
