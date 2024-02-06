import React from 'react';
import { Buffer } from 'buffer';
import { DOMParser } from '@xmldom/xmldom';
import { assertDefined } from '@votingworks/basics';
import {
  Bubble,
  Color,
  Image,
  Page,
  Rectangle,
  TextBox,
} from './document_types';

interface SvgRectangleProps extends Omit<Rectangle, 'type' | 'children'> {
  children?: React.ReactNode;
}

export function SvgRectangle({
  x,
  y,
  borderRadius,
  fill,
  children,
  ...rectProps
}: SvgRectangleProps): JSX.Element {
  // eslint-disable-next-line no-param-reassign
  fill = fill ?? 'none';
  return (
    <svg x={x} y={y} overflow="visible">
      <rect
        x={0}
        y={0}
        rx={borderRadius}
        ry={borderRadius}
        fill={fill}
        {...rectProps}
      />
      {children}
    </svg>
  );
}

type SvgBubbleProps = Omit<Bubble, 'type'>;

export function SvgBubble({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gridPosition,
  ...props
}: SvgBubbleProps): JSX.Element {
  return <SvgRectangle {...props} />;
}

function splitIntoHtmlSpans(html: string): React.ReactNode[] {
  // Remove any <html> and </html> tags in the line
  // eslint-disable-next-line no-param-reassign
  html = html.replace(/<\/?html>/, '');

  // DOMParser breaks if there's a closing tag with no opening tag, so fix that
  // It doesn't mind unclosed tags, so we don't need to fix those
  const firstClosingTag = html.match(/<\/\w+>/)?.[0];
  const firstClosingTagIndex = firstClosingTag
    ? html.indexOf(firstClosingTag)
    : Infinity;
  const firstOpeningTagIndex = html.search(/<\w+>/);
  if (firstClosingTagIndex < firstOpeningTagIndex) {
    // eslint-disable-next-line no-param-reassign
    html = assertDefined(firstClosingTag).replace('</', '<') + html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<html>${html}</html>`, 'text/html');
  const spans = Array.from(assertDefined(doc.firstChild).childNodes).map(
    (node, index) => {
      return (
        <tspan
          // eslint-disable-next-line react/no-array-index-key
          key={`span${index}`}
          fontWeight={node.nodeName === 'b' ? 700 : undefined}
          textDecoration={
            node.nodeName === 'u'
              ? 'underline'
              : node.nodeName === 'i'
              ? 'italic'
              : node.nodeName === 's'
              ? 'line-through'
              : undefined
          }
        >
          {node.textContent}
        </tspan>
      );
    }
  );
  return spans;
}

type SvgTextBoxProps = Omit<TextBox, 'type'>;

export function SvgTextBox({
  x,
  y,
  width,
  height,
  textLines,
  lineHeight,
  align = 'left',
  ...textProps
}: SvgTextBoxProps): JSX.Element {
  const isHtml =
    textLines[0].startsWith('<html>') &&
    textLines[textLines.length - 1].endsWith('</html>');
  return (
    <svg x={x} y={y} width={width} height={height}>
      {textLines.map((textLine, index) => {
        return (
          <text
            // eslint-disable-next-line react/no-array-index-key
            key={textLine + index}
            // Adjust x coordinate if textAnchor is 'end' so that the overall
            // content box location stays the same, since 'end' moves the text to
            // the other side of the x coordinate. Similarly for 'middle'.
            x={
              {
                left: 0,
                center: width / 2,
                right: width,
              }[align]
            }
            y={(index + 1) * lineHeight}
            textAnchor={
              {
                left: 'start',
                center: 'middle',
                right: 'end',
              }[align]
            }
            {...textProps}
          >
            {isHtml ? splitIntoHtmlSpans(textLine) : textLine}
          </text>
        );
      })}
    </svg>
  );
}

export type SvgImageProps = Omit<Image, 'type'>;

export function SvgImage({
  href,
  contents,
  ...props
}: SvgImageProps): JSX.Element {
  if (href) {
    return <image {...props} href={href} />;
  }

  if (contents) {
    return (
      <image
        {...props}
        href={`data:image/svg+xml;base64,${Buffer.from(contents).toString(
          'base64'
        )}`}
      />
    );
  }

  throw new Error('Image must have href or contents');
}

interface SvgPageProps extends Omit<Page, 'children'> {
  x?: number;
  y?: number;
  width: number;
  height: number;
  stroke?: Color;
  strokeWidth?: number;
  fontFamily?: string;
  children: React.ReactNode;
}

export function SvgPage({
  x,
  y,
  width,
  height,
  stroke,
  strokeWidth,
  children,
  fontFamily,
}: SvgPageProps): JSX.Element {
  return (
    <svg
      // Disable common ligatures to avoid `fi` being rendered as a ligature.
      // Note that this CSS only works on the frontend, so I manually removed
      // the ligatures from the Roboto-Bold font that we use on the backend.
      style={{ fontVariantLigatures: 'no-common-ligatures' }}
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={fontFamily}
    >
      <rect
        width={width}
        height={height}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="white"
      />
      {children}
    </svg>
  );
}
