import { BehaviorSubject } from './observable';

test('BehaviorSubject', () => {
  const subject = new BehaviorSubject(1);
  const subscriber1 = jest.fn();
  const subscriber2 = jest.fn();

  const unsubscribe1 = subject.subscribe(subscriber1);
  const unsubscribe2 = subject.subscribe(subscriber2);

  // initial value
  expect(subscriber1).toHaveBeenCalledWith(1);
  expect(subscriber2).toHaveBeenCalledWith(1);

  // both subscribed
  subject.next(2);

  expect(subscriber1).toHaveBeenCalledWith(2);
  expect(subscriber2).toHaveBeenCalledWith(2);

  // #1 unsubscribed
  unsubscribe1();
  subject.next(3);

  expect(subscriber1).not.toHaveBeenCalledWith(3);
  expect(subscriber2).toHaveBeenCalledWith(3);

  // both unsubscribed
  unsubscribe2();
  subject.next(4);

  expect(subscriber1).not.toHaveBeenCalledWith(4);
  expect(subscriber2).not.toHaveBeenCalledWith(4);

  // unsubscribing again has no effect
  unsubscribe1();
  unsubscribe2();

  // new subscriber gets last value
  const subscriber3 = jest.fn();
  const unsubscribe3 = subject.subscribe(subscriber3);

  expect(subscriber3).toHaveBeenCalledWith(4);
  unsubscribe3();
});
