import { describe, expect, test } from 'vitest';

import { convertHtmlToAudioCues } from './rich_text';

test('convertHtmlToAudioCues', () => {
  expect(convertHtmlToAudioCues('This is HTML text')).toEqual(
    'This is HTML text'
  );
  expect(convertHtmlToAudioCues('<p>This is HTML text</p>')).toEqual(
    'This is HTML text'
  );
  expect(
    convertHtmlToAudioCues('<p>This is <s>Markdown</s> HTML text</p>')
  ).toEqual(
    'This is [begin strikethrough] Markdown [end strikethrough] HTML text'
  );
  expect(convertHtmlToAudioCues('<p>This is <u>HTML</u> text</p>')).toEqual(
    'This is [begin underline] HTML [end underline] text'
  );

  expect(
    convertHtmlToAudioCues(
      `This is a list:
<ol> <li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>`
    )
  ).toEqual(`This is a list:
 1. Item 1
2. Item 2
3. Item 3`);

  expect(convertHtmlToAudioCues('This is an image: <img src="src" >')).toEqual(
    'This is an image: [image]'
  );

  expect(
    convertHtmlToAudioCues('This is also an image: <svg>foo bar</svg')
  ).toEqual('This is also an image: [image].');
});

describe('convertHtmlToAudioCues - tables', () => {
  const TABLE_SIMPLE = `
    <table>
      <tbody>
        <tr> <th>Name</th>   <th><p>Department</p></th> </tr>
        <tr> <td>Alice</td>  <td><p>Accounting</p></td> </tr>
        <tr> <td>Bob</td>    <td><p>HR</p></td>         </tr>
        <br />
      </tbody>
    </table>
  `;
  test('simple', () => {
    expect(convertHtmlToAudioCues(TABLE_SIMPLE)).toEqual(
      [
        'Name: Alice.',
        'Department: Accounting.',
        'Name: Bob.',
        'Department: HR.',
      ].join('\n')
    );
  });

  const TABLE_THEAD = `
    <table>
      <tbody>
        <tr> <th>Name</th>   <th>Department</th> </tr>
        <tr> <td>Alice</td>  <td>Accounting</td> </tr>
        <tr> <td>Bob</td>    <td>HR</td>         </tr>
      </tbody>
    </table>
  `;
  test('with thead', () => {
    expect(convertHtmlToAudioCues(TABLE_THEAD)).toEqual(
      [
        'Name: Alice.',
        'Department: Accounting.',
        'Name: Bob.',
        'Department: HR.',
      ].join('\n')
    );
  });

  const TABLE_FIRST_HEADING_EMPTY = `
    <table>
      <tbody>
        <tr> <th></th>       <th>Department</th> </tr>
        <tr> <td>Alice</td>  <td>Accounting</td> </tr>
        <tr> <td>Bob</td>    <td>HR</td>         </tr>
      </tbody>
    </table>
  `;
  test('no first-column heading', () => {
    expect(convertHtmlToAudioCues(TABLE_FIRST_HEADING_EMPTY)).toEqual(
      ['Alice.', 'Department: Accounting.', 'Bob.', 'Department: HR.'].join(
        '\n'
      )
    );
  });

  const TABLE_NO_HEADER = `
    <table>
      <tbody>
        <tr> <td>Name</td>   <td>Department</td> </tr>
        <tr> <td>Alice</td>  <td>Accounting</td> </tr>
        <tr> <td>Bob</td>    <td>HR</td>         </tr>
      </tbody>
    </table>
  `;
  test('no header row', () => {
    expect(convertHtmlToAudioCues(TABLE_NO_HEADER)).toEqual(
      ['Name.', 'Department.', 'Alice.', 'Accounting.', 'Bob.', 'HR.'].join(
        '\n'
      )
    );
  });
});
