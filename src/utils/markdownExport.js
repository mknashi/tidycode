import { marked } from 'marked';

// Markdown -> .docx built from marked's tokens, so headings, lists and tables
// come out as real Word structures. `docx` is loaded on first export only.

const CODE_FONT = 'Consolas';
const CODE_SHADING = 'F3F4F6';
const RULE_COLOR = 'D1D5DB';
const MAX_IMAGE_WIDTH = 600;
const INDENT_STEP = 720; // twips, half an inch

const decodeEntities = (text) => {
  if (!text.includes('&')) return text;
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${text}`, 'text/html');
  return doc.body.textContent || '';
};

const stripTags = (html) => {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  doc.body.querySelectorAll('script, style').forEach((node) => node.remove());
  return (doc.body.textContent || '').trim();
};

const sniffImageType = (bytes) => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  return null;
};

async function loadImage(href, resolveImage) {
  let bytes = null;
  if (/^(https?:|data:)/i.test(href)) {
    const response = await fetch(href);
    if (!response.ok) return null;
    bytes = new Uint8Array(await response.arrayBuffer());
  } else if (resolveImage) {
    bytes = await resolveImage(href);
  }
  if (!bytes || bytes.length < 4) return null;
  const type = sniffImageType(bytes);
  if (!type) return null;

  const bitmap = await createImageBitmap(new Blob([bytes]));
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const size = { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) };
  bitmap.close();
  return { type, data: bytes, ...size };
}

async function loadImages(tokens, resolveImage) {
  const hrefs = new Set();
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'image' && token.href) hrefs.add(token.href);
  });
  const images = new Map();
  await Promise.all([...hrefs].map(async (href) => {
    try {
      const image = await loadImage(href, resolveImage);
      if (image) images.set(href, image);
    } catch (error) {
      console.warn('[markdownExport] Could not load image', href, error);
    }
  }));
  return images;
}

/**
 * @param {string} markdown
 * @param {{ title?: string, resolveImage?: (href: string) => Promise<Uint8Array|null> }} options
 *   resolveImage loads images with relative paths; without it they become their alt text.
 * @returns {Promise<Uint8Array>}
 */
export async function markdownToDocx(markdown, { title, resolveImage } = {}) {
  const {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat,
    Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx');

  const tokens = marked.lexer(String(markdown ?? ''));
  const images = await loadImages(tokens, resolveImage);

  const codeShading = { type: ShadingType.CLEAR, color: 'auto', fill: CODE_SHADING };
  const orderedStarts = new Set();
  let listInstance = 0;

  const inline = (items = [], style = {}) => items.flatMap((token) => {
    switch (token.type) {
      case 'text':
        return token.tokens
          ? inline(token.tokens, style)
          : [new TextRun({ ...style, text: token.escaped ? token.text : decodeEntities(token.text) })];
      case 'escape':
        return [new TextRun({ ...style, text: token.text })];
      case 'strong':
        return inline(token.tokens, { ...style, bold: true });
      case 'em':
        return inline(token.tokens, { ...style, italics: true });
      case 'del':
        return inline(token.tokens, { ...style, strike: true });
      case 'codespan':
        return [new TextRun({ ...style, text: token.text, font: CODE_FONT, shading: codeShading })];
      case 'br':
        return [new TextRun({ break: 1 })];
      case 'checkbox':
        return [new TextRun({ ...style, text: token.checked ? '☒ ' : '☐ ' })];
      case 'link': {
        const children = inline(token.tokens, { ...style, style: 'Hyperlink' });
        return /^(https?:|mailto:)/i.test(token.href)
          ? [new ExternalHyperlink({ link: token.href, children })]
          : inline(token.tokens, style);
      }
      case 'image': {
        const image = images.get(token.href);
        if (image) {
          return [new ImageRun({
            type: image.type,
            data: image.data,
            transformation: { width: image.width, height: image.height },
            altText: { name: token.text || 'image', description: token.text || '' },
          })];
        }
        return token.text ? [new TextRun({ ...style, text: `[${token.text}]`, italics: true })] : [];
      }
      case 'html':
        return /^<br\s*\/?>$/i.test(token.text.trim()) ? [new TextRun({ break: 1 })] : [];
      default:
        return token.text ? [new TextRun({ ...style, text: token.text })] : [];
    }
  });

  // Paragraph properties for content nested in blockquotes and list items
  const blockProps = (ctx) => {
    const left = INDENT_STEP * (ctx.quote + ctx.indent);
    const props = left ? { indent: { left } } : {};
    if (ctx.quote) {
      props.border = { left: { style: BorderStyle.SINGLE, size: 18, color: RULE_COLOR, space: 8 } };
    }
    return props;
  };

  const listItem = (item, list, level, ctx, instance) => {
    const out = [];
    let lead = [];
    let numbered = false;
    for (const token of item.tokens) {
      if (token.type === 'checkbox') {
        lead = inline([token]);
        continue;
      }
      if (!numbered && (token.type === 'text' || token.type === 'paragraph')) {
        let marker;
        if (item.task) marker = { indent: { left: INDENT_STEP * (level + 1) } }; // the checkbox is the marker
        else if (list.ordered) marker = { numbering: { reference: `md-ordered-${list.start || 1}`, level, instance } };
        else marker = { bullet: { level } };
        out.push(new Paragraph({
          children: [...lead, ...inline(token.tokens || [token])],
          spacing: { after: list.loose ? 120 : 40 },
          ...marker,
          ...(ctx.quote ? blockProps({ ...ctx, indent: 0 }) : {}),
        }));
        lead = [];
        numbered = true;
        continue;
      }
      if (token.type === 'list') {
        out.push(...listBlock(token, level + 1, ctx));
        continue;
      }
      // Further paragraphs, code and quotes inside the item sit under its text
      out.push(...blocks([token], { ...ctx, indent: ctx.indent + level + 1 }));
    }
    return out;
  };

  const listBlock = (list, level, ctx) => {
    if (list.ordered) orderedStarts.add(list.start || 1);
    const instance = ++listInstance;
    return list.items.flatMap((item) => listItem(item, list, level, ctx, instance));
  };

  const table = (token) => {
    const align = (index) => ({
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
    }[token.align?.[index]] || AlignmentType.LEFT);
    const row = (cells, header) => new TableRow({
      tableHeader: header,
      children: cells.map((cell, index) => new TableCell({
        shading: header ? codeShading : undefined,
        children: [new Paragraph({
          alignment: align(index),
          children: inline(cell.tokens, header ? { bold: true } : {}),
        })],
      })),
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [row(token.header, true), ...token.rows.map((cells) => row(cells, false))],
    });
  };

  const blocks = (items, ctx = { quote: 0, indent: 0 }) => items.flatMap((token) => {
    switch (token.type) {
      case 'heading':
        return [new Paragraph({
          heading: HeadingLevel[`HEADING_${Math.min(token.depth, 6)}`],
          children: inline(token.tokens),
          ...blockProps(ctx),
        })];
      case 'paragraph':
      case 'text':
        return [new Paragraph({ children: inline(token.tokens || [token]), ...blockProps(ctx) })];
      case 'code': {
        const lines = token.text.split('\n');
        return lines.map((line, index) => new Paragraph({
          children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: 20 })],
          shading: codeShading,
          spacing: { before: 0, after: index === lines.length - 1 ? 200 : 0, line: 260 },
          ...blockProps(ctx),
        }));
      }
      case 'blockquote':
        return blocks(token.tokens, { ...ctx, quote: ctx.quote + 1 });
      case 'list':
        return listBlock(token, 0, ctx);
      case 'table':
        return [table(token), new Paragraph({ children: [] })];
      case 'hr':
        return [new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
        })];
      case 'html': {
        const text = stripTags(token.text);
        return text ? [new Paragraph({ children: [new TextRun(text)], ...blockProps(ctx) })] : [];
      }
      case 'checkbox':
        return [new Paragraph({ children: inline([token]) })];
      default:
        return [];
    }
  });

  const children = blocks(tokens);

  const doc = new Document({
    title: title || undefined,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { after: 160, line: 276 } },
        },
      },
    },
    numbering: {
      config: [...orderedStarts].map((start) => ({
        reference: `md-ordered-${start}`,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          start: level === 0 ? start : 1,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: INDENT_STEP * (level + 1), hanging: 360 } } },
        })),
      })),
    },
    sections: [{ children: children.length ? children : [new Paragraph({ children: [] })] }],
  });

  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
