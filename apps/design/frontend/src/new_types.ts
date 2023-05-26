import { PixelUnit } from './document_types';

interface BoxLayout {}
interface TextBoxLayout {}
interface ImageLayout {}
interface SlotLayout {}

type AnyLayout = BoxLayout | TextBoxLayout | ImageLayout | SlotLayout;

interface PageLayout {
  width: PixelUnit;
  height: PixelUnit;
  children: AnyLayout[];
}

// Elements have a position (relative to parent) and dimensions
interface BaseElement {
  x: PixelUnit;
  y: PixelUnit;
  width: PixelUnit;
  height: PixelUnit;
}

type BoxElement = BaseElement;
type TextBoxElement = BaseElement;
type ImageElement = BaseElement;
type SlotElement = BaseElement;

type AnyElement = BoxElement | TextBoxElement | ImageElement | SlotElement;

interface PageElement {
  width: PixelUnit;
  height: PixelUnit;
  children: AnyElement[];
}

function renderAnyLayout(layout: AnyLayout): AnyElement {}
function renderPageLayout(pageLayout: PageLayout): PageElement {
  return {
    width: pageLayout.width,
    height: pageLayout.height,
    children: pageLayout.children.map(renderAnyLayout),
  };
}

function getSlots(pageElement: PageElement): SlotElement[] {
  return pageElement.children.flatMap((child) =>
    child.type === 'Slot' ? child : getSlots(child)
  );
}

function fillSlot(
  pageElement: PageElement,
  slotElement: SlotElement,
  element: AnyElement
): AnyElement {}
