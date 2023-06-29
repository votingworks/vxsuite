import { render, screen } from '../test/react_testing_library';
import { LabelledText } from './labelled_text';

test('renders label above text by default', () => {
  const { container } = render(
    <LabelledText label="A label">Some text</LabelledText>
  );

  const outerElement = container.children[0];
  expect(screen.getByText('A label')).toEqual(outerElement.children[0]);
  expect(screen.getByText('Some text')).toEqual(outerElement.children[1]);
});

test('renders label below text when specified', () => {
  const { container } = render(
    <LabelledText labelPosition="bottom" label="A label">
      Some text
    </LabelledText>
  );

  const outerElement = container.children[0];
  expect(screen.getByText('Some text')).toEqual(outerElement.children[0]);
  expect(screen.getByText('A label')).toEqual(outerElement.children[1]);
});
