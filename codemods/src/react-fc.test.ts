import { transformSync } from '@babel/core';
import plugin from './react-fc';

function check(input: string, output: string): void {
  expect(
    transformSync(input, {
      plugins: [plugin],
      parserOpts: { plugins: ['jsx', 'typescript'] },
    })?.code
  ).toEqual(output.trim());
}

test('not named right', () => {
  check(
    `
const foo = () => {};

function bar() {}
`,
    `
const foo = () => {};

function bar() {}
`
  );
});

test('multiple declarators', () => {
  check(
    `
const Foo = () => {},
      Bar = () => {};
`,
    `
const Foo = () => {},
      Bar = () => {};
`
  );
});

test('no initial value', () => {
  check(`let a;`, `let a;`);
});

test('not a function value', () => {
  check(`const A = 1;`, `const A = 1;`);
});

test('not a declaration', () => {
  check(`foo();`, `foo();`);
});

test('adding return type annotation', () => {
  check(
    `
const Foo = () => {
  return <div />;
};
  `,
    `
const Foo = (): JSX.Element => {
  return <div />;
};
    `
  );
});

test('single param no type params', () => {
  check(
    `
const Foo: React.FC = (props) => {
  return <div />;
};
  `,
    `
const Foo = (props): JSX.Element => {
  return <div />;
};
    `
  );
});

test('multiple params no type params', () => {
  check(
    `
const Foo: React.FC = (a, b) => {
  return <div />;
};
  `,
    `
const Foo = (a, b): JSX.Element => {
  return <div />;
};
    `
  );
});

test('multiple type params', () => {
  check(
    `
const Foo: React.FC<A, B> = (props) => {
  return <div />;
};
  `,
    `
const Foo = (props): JSX.Element => {
  return <div />;
};
    `
  );
});

test('rewrite export', () => {
  check(
    `
export const Foo = () => {
  return <div />;
};
export default function Bar() {
  return <div />;
}
  `,
    `
export const Foo = (): JSX.Element => {
  return <div />;
};
export default function Bar(): JSX.Element {
  return <div />;
}
    `
  );
});

test('adding return type annotation (with props annotation)', () => {
  check(
    `
const Foo = ({
  bar
}: Props) => {
  return <div />;
};
  `,
    `
const Foo = ({
  bar
}: Props): JSX.Element => {
  return <div />;
};
    `
  );
});

test('rewrite React.FC<Props>', () => {
  check(
    `
const Foo: React.FC<Props> = ({
  bar
}) => {
  return <div />;
};
`,
    `
const Foo = ({
  bar
}: Props): JSX.Element => {
  return <div />;
};
    `
  );
});
