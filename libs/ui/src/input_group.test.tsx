import { render } from '../test/react_testing_library';

import { InputGroup } from './input_group';
import { Select } from './select';

test('renders InputGroup', () => {
  render(
    <InputGroup>
      <Select>
        <option value="1">1</option>
      </Select>
      <Select>
        <option value="2">2</option>
      </Select>
      <Select>
        <option value="3">3</option>
      </Select>
    </InputGroup>
  );
});
