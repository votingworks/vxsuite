import { throwIllegalValue } from './throw_illegal_value';

test('enum example', () => {
  enum ABC {
    A,
    B,
    C,
  }

  const abc = ABC.A as ABC;
  switch (abc) {
    case ABC.A:
    case ABC.B:
    case ABC.C:
      break;

    default:
      throwIllegalValue(abc);
  }
});

test('invalid example', () => {
  enum ABC {
    A,
    B,
    C,
  }

  const abc = ABC.C as ABC;
  switch (abc) {
    case ABC.A:
    case ABC.B:
      // case ABC.C:
      break;

    default:
      // @ts-expect-error - because it's not narrowed to `never`
      expect(() => throwIllegalValue(abc)).toThrowError('Illegal Value: 2');
  }
});

test('display name', () => {
  type Thing = { type: 'car' } | { type: 'dog' } | { type: 'house' };

  const thing = { type: 'hotdog' } as unknown as Thing;
  switch (thing.type) {
    case 'car':
    case 'dog':
    case 'house':
      break;

    default:
      expect(() => throwIllegalValue(thing, 'type')).toThrowError(
        'Illegal Value: hotdog'
      );
  }
});
