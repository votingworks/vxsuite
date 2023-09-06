import { List } from './list';
import { ListItem } from './list_item';
import { render, screen } from '../test/react_testing_library';

test('renders number of specified columns', () => {
  render(
    <List maxColumns={3}>
      <ListItem>one</ListItem>
      <ListItem>two</ListItem>
      <ListItem>three</ListItem>
      <ListItem>four</ListItem>
    </List>
  );

  expect(screen.getByRole('list')).toHaveStyleRule(
    'grid-template-columns',
    'repeat(3,1fr)'
  );
});

test('renders only as many columns as needed if all list items fit on one row', () => {
  const { rerender } = render(
    <List maxColumns={3}>
      <ListItem>one</ListItem>
    </List>
  );

  expect(screen.getByRole('list')).toHaveStyleRule(
    'grid-template-columns',
    'repeat(1,1fr)'
  );

  rerender(
    <List maxColumns={3}>
      <ListItem>one</ListItem>
      <ListItem>two</ListItem>
    </List>
  );

  expect(screen.getByRole('list')).toHaveStyleRule(
    'grid-template-columns',
    'repeat(2,1fr)'
  );
});

test('defaults to 1 column', () => {
  render(
    <List>
      <ListItem>one</ListItem>
      <ListItem>two</ListItem>
      <ListItem>three</ListItem>
    </List>
  );

  expect(screen.getByRole('list')).toHaveStyleRule(
    'grid-template-columns',
    'repeat(1,1fr)'
  );
});
