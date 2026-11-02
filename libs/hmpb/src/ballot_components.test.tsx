import { expect, test } from 'vitest';
import ReactDomServer from 'react-dom/server';
import { Buffer } from 'node:buffer';
import { SvgImage } from './ballot_components.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const BOX = { height: '5rem', width: '5rem' } as const;

test('SvgImage renders the image inside a box of the given size', () => {
  expect(
    ReactDomServer.renderToString(<SvgImage svg={SVG} style={BOX} />)
  ).toEqual(
    `<img src="data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}" ` +
      'style="object-fit:contain;object-position:left top;height:5rem;width:5rem"/>'
  );
});

test('SvgImage renders only the box when the image is empty', () => {
  expect(
    ReactDomServer.renderToString(<SvgImage svg="" style={BOX} />)
  ).toEqual('<div style="height:5rem;width:5rem"></div>');
});
