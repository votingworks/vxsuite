import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt'],
  },
  allowedSchemes: ['data'],
};

/**
 * Sanitizes user-provided rich text HTML (e.g. contest descriptions) to prevent
 * XSS attacks. Must be applied everywhere such HTML is rendered as HTML.
 */
export function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
