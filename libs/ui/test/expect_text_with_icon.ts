import { screen, within } from './react_testing_library';

export async function expectTextWithIcon(
  text: string,
  icon: string
): Promise<void> {
  const textElement = await screen.findByText(text);
  expect(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    within(textElement.closest('p')!)
      .getByRole('img', {
        hidden: true,
      })
      .getAttribute('data-icon')
  ).toEqual(icon);
}
