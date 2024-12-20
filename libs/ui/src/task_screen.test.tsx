import { H1, TaskControls, TaskHeader, TaskScreen } from '.';
import { render, screen } from '../test/react_testing_library';

test('renders task screen', () => {
  render(
    <TaskScreen>
      <TaskControls>
        <TaskHeader>
          <H1>Task Screen Title</H1>
        </TaskHeader>
      </TaskControls>
    </TaskScreen>
  );
  screen.getByRole('heading', { name: 'Task Screen Title' });
});
