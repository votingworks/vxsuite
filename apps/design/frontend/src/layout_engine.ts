/* eslint-disable @typescript-eslint/no-use-before-define */
import { iter, throwIllegalValue } from '@votingworks/basics';
import { AnyElement, PixelUnit, Sides } from './document_types';
import {
  BoxNode,
  AnyNode,
  ShorthandSides,
  TextBoxNode,
  TextSpanNode,
  ImageNode,
} from './layout_types';

interface Point {
  x: PixelUnit;
  y: PixelUnit;
}

interface Dimensions {
  width: PixelUnit;
  height: PixelUnit;
}

function shorthandToSides(
  shorthand?: ShorthandSides<PixelUnit>
): Sides<PixelUnit> {
  if (shorthand === undefined) {
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    };
  }
  if (typeof shorthand === 'object' && 'top' in shorthand) {
    return shorthand;
  }
  if (typeof shorthand === 'object' && 'topBottom' in shorthand) {
    return {
      top: shorthand.topBottom,
      bottom: shorthand.topBottom,
      left: shorthand.leftRight,
      right: shorthand.leftRight,
    };
  }
  return {
    top: shorthand,
    bottom: shorthand,
    left: shorthand,
    right: shorthand,
  };
}

interface ElementsWithDimensions {
  elements: AnyElement[];
  dimensions: Dimensions;
}

function layOutBox(
  {
    padding: paddingShorthand,
    gap,
    width = 'grow',
    // height = 'grow',
    // verticalAlign,
    // horizontalAlign,
    flowDirection,
    strokeColor,
    strokeWidth,
    fillColor,
    children,
  }: BoxNode,
  position: Point,
  dimensions: Dimensions
): ElementsWithDimensions {
  const padding = shorthandToSides(paddingShorthand);
  const contentHeight = dimensions.height - padding.top - padding.bottom;
  const contentWidth = dimensions.width - padding.left - padding.right;

  if (flowDirection === 'column') {
    const childHeight =
      (contentHeight - (children.length - 1) * gap) / children.length;
    const childrenElements = [];
    let currentY = 0;
    for (const childNode of children) {
      const childPosition: Point = {
        x: position.x + padding.left,
        y: position.y + padding.top + currentY,
      };
      const child = layOutNode(childNode, childPosition, {
        width: contentWidth,
        height: childHeight,
      });
      childrenElements.push(child);
      currentY += child.dimensions.height + gap;
    }

    const boxWidth =
      width === 'grow'
        ? dimensions.width
        : iter(childrenElements)
            .map((child) => child.dimensions.width)
            .max() ?? 0 + padding.left + padding.right;
    // const height = padding.top + currentY - gap + padding.bottom;

    return {
      elements: [
        {
          type: 'Rectangle',
          ...position,
          width: boxWidth,
          height: dimensions.height,
          strokeColor,
          strokeWidth: shorthandToSides(strokeWidth),
          fillColor,
        },
        ...childrenElements.flatMap((child) => child.elements),
      ],
      dimensions: {
        width: boxWidth,
        height: dimensions.height,
      },
    };
  }

  if (flowDirection === 'row') {
    const childWidth =
      (contentWidth - (children.length - 1) * gap) / children.length;
    const childrenElements = [];
    let nextChildX = 0;
    // First lay out the shrinking/fixed width children,
    // then divvy up the remaining space among the growing children.
    for (const childNode of children) {
      const childPosition: Point = {
        x: position.x + padding.left + nextChildX,
        y: position.y + padding.top,
      };
      const child = layOutNode(childNode, childPosition, {
        width: childWidth,
        height: contentHeight,
      });
      childrenElements.push(child);
      nextChildX += child.dimensions.width + gap;
    }

    const boxWidth =
      width === 'grow'
        ? dimensions.width
        : nextChildX + padding.right + padding.left;

    return {
      elements: [
        {
          type: 'Rectangle',
          ...position,
          width: boxWidth,
          height: dimensions.height,
          strokeColor,
          strokeWidth: shorthandToSides(strokeWidth),
          fillColor,
        },
        ...childrenElements.flatMap((child) => child.elements),
      ],
      dimensions: {
        width: boxWidth,
        height: dimensions.height,
      },
    };
  }

  throwIllegalValue(flowDirection);
}

function convertTextToSpans(text: TextBoxNode['text']): TextSpanNode[] {
  if (typeof text === 'string') {
    return [{ type: 'TextSpan', text, fontWeight: 400 }];
  }
  if (Array.isArray(text)) {
    return text.flatMap(convertTextToSpans);
  }
  return [text];
}

function wrapTextLines(
  textSpans: TextSpanNode[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  width: PixelUnit
): Array<TextSpanNode[]> {
  return textSpans.map((span) => [span]); // TODO
}

function layOutTextBox(
  { text, fontSize, lineHeight }: TextBoxNode,
  position: Point,
  maxWidth: PixelUnit
): ElementsWithDimensions {
  const textSpans = convertTextToSpans(text);
  const textLines = wrapTextLines(textSpans, maxWidth);
  const height = textLines.length * lineHeight;
  const width =
    iter(textLines)
      .map((line) =>
        iter(line)
          .map((span) => (span.text.length * fontSize) / 2) // TODO use actual text width
          .sum()
      )
      .max() ?? 0;
  return {
    elements: [
      {
        type: 'TextBox',
        ...position,
        width,
        height,
        textLines,
        fontSize,
        lineHeight,
      },
    ],
    dimensions: { width, height },
  };
}

function layOutImage(
  { href, originalWidth, originalHeight }: ImageNode,
  position: Point,
  width: PixelUnit
): ElementsWithDimensions {
  const height = (originalHeight / originalWidth) * width;
  return {
    elements: [
      {
        type: 'Image',
        ...position,
        width,
        height,
        href,
      },
    ],
    dimensions: { width, height },
  };
}

function layOutNode(
  node: AnyNode,
  position: Point,
  dimensions: { width: PixelUnit; height: PixelUnit }
): ElementsWithDimensions {
  switch (node.type) {
    case 'Box':
      return layOutBox(node, position, dimensions);
    case 'TextBox':
      return layOutTextBox(node, position, dimensions.width);
    case 'Image':
      return layOutImage(node, position, dimensions.width);
    default:
      throwIllegalValue(node);
  }
}

export function layOutPage(
  rootNode: BoxNode,
  dimensions: { width: PixelUnit; height: PixelUnit }
): AnyElement[] {
  const { elements } = layOutNode(rootNode, { x: 0, y: 0 }, dimensions);
  return elements;
}

export const testLayoutPage: BoxNode = {
  type: 'Box',
  padding: 10,
  gap: 0,
  strokeColor: 'black',
  strokeWidth: 1,
  fillColor: 'white',
  flowDirection: 'column',
  children: [
    {
      type: 'Box',
      width: 'shrink',
      padding: 10,
      gap: 0,
      strokeColor: 'red',
      strokeWidth: 1,
      fillColor: 'white',
      flowDirection: 'column',
      children: [
        {
          type: 'TextBox',
          text: ['Sample Ballot', 'General Electioning'],
          fontSize: 24,
          lineHeight: 24,
        },
        {
          type: 'TextBox',
          text: ['Lincoln County, State of Hamilton', 'November 3, 2023'],
          fontSize: 12,
          lineHeight: 14,
        },
      ],
    },
    {
      type: 'Box',
      padding: 10,
      gap: 10,
      strokeColor: 'blue',
      strokeWidth: 1,
      fillColor: 'white',
      flowDirection: 'row',
      children: [
        {
          type: 'Box',
          padding: 10,
          gap: 0,
          fillColor: 'orange',
          flowDirection: 'column',
          children: [],
        },
        {
          type: 'Box',
          padding: 10,
          gap: 0,
          fillColor: 'orange',
          flowDirection: 'column',
          children: [],
        },
        {
          type: 'Box',
          padding: 10,
          gap: 0,
          fillColor: 'orange',
          flowDirection: 'column',
          children: [],
        },
      ],
    },
    {
      type: 'Box',
      padding: 10,
      gap: 0,
      strokeColor: 'green',
      strokeWidth: 1,
      fillColor: 'white',
      flowDirection: 'row',
      children: [],
    },
  ],
};

function layOutPage(pageLayout: PageLayout): Page {}
