# Shared UI Components

This package contains standardized UI components used across VxSuite apps.

## Development

A live demo of the components is available via a storybook.js integration that
enables rapid prototyping and convenient testing before importing them for use
in a given app.

To run the demo server, first follow the instructions in the
[VxSuite README](../../README.md) to set up your dev environment, then run the
following command:

```sh
# in libs/ui
pnpm start
```

You can then browse existing components by opening http://localhost:6060/ in
your browser.

### Adding a new component

**TODO**

#### Configure the component demo:

To include a new component in the live demo, create a new
`my_component.stories.tsx` file adjacent to the new component:

```
libs/ui
  > src
    > my_component.tsx
    > my_component.stories.tsx  <--
    > my_component.test.tsx
```

This file should contain at least one named export containing a render function
for the new component and one default export containing the component metadata
in the
[Component Story Format](https://storybook.js.org/docs/7.0/react/api/csf).

**Example:**

```tsx
// src/my_component.stories.tsx

import React from 'react';
import type { Meta } from '@storybook/react';

import { MyComponent, MyComponentProps } from './my_component';

const initialProps: MyComponentProps = {
  size: 'large',
};

const meta: Meta<typeof MyComponent> = {
  title: 'libs-ui/MyComponent',
  component: MyComponent,
  args: initialProps,
};
export default meta;

export { MyComponent };
```

The storybook.js UI will now have a new "MyComponent" item in the sidebar.

Storybook.js should automatically detect any available props on the component
and create appropriate controls in the demo UI for manipulating component props,
but you may also explicitly list out props and specify data types and control
types in the `Meta.argTypes` field.

For more information on customizing a component demo, take a look at the
[Storybook.js docs](https://storybook.js.org/docs/7.0/react/writing-stories/introduction).

## Testing

```sh
pnpm test
```
