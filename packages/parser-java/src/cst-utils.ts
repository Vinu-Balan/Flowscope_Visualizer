/**
 * Small, generic helpers for pulling specific tokens out of an arbitrary
 * java-parser CST subtree, without hand-writing the exact grammar path to
 * every construct we care about (e.g. a string literal buried inside
 * `elementValue -> conditionalExpression -> ... -> literal`). Deliberately
 * generic rather than exhaustive — see ADR-006.
 */

interface GenericToken {
  readonly image: string;
  readonly startLine?: number;
  readonly startOffset?: number;
  readonly tokenType?: { readonly name?: string };
}

interface GenericCstNode {
  readonly children: Readonly<Record<string, readonly unknown[]>>;
}

function isToken(node: unknown): node is GenericToken {
  return typeof node === 'object' && node !== null && 'image' in node && 'tokenType' in node;
}

function isCstNode(node: unknown): node is GenericCstNode {
  return typeof node === 'object' && node !== null && 'children' in node;
}

/** Depth-first search for the first token of any kind — used to anchor a source line to an arbitrary subtree. */
export function findFirstToken(node: unknown): GenericToken | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstToken(item);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (isToken(node)) {
    return node;
  }
  if (isCstNode(node)) {
    for (const value of Object.values(node.children)) {
      const found = findFirstToken(value);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Left-to-right join of every token image in a subtree, reconstructing
 * source order by `startOffset` — a CST node's `children` map has no
 * guaranteed key order (e.g. a binary expression's two operands and its
 * operator live under separate keys), so a plain depth-first walk would
 * emit them in grammar-declaration order, not reading order. A crude but
 * honest fallback rendering of an expression (e.g. `customer == null`).
 */
export function renderTokensInOrder(node: unknown): string {
  const tokens: GenericToken[] = [];

  function visit(current: unknown): void {
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item);
      }
      return;
    }
    if (isToken(current)) {
      tokens.push(current);
      return;
    }
    if (isCstNode(current)) {
      for (const value of Object.values(current.children)) {
        visit(value);
      }
    }
  }

  visit(node);
  return tokens
    .slice()
    .sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0))
    .map((token) => token.image)
    .join(' ')
    .replace(/\s*\.\s*/gu, '.')
    .replace(/\s+\(/gu, '(')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+\)/gu, ')')
    .replace(/\s+,/gu, ',');
}

/**
 * Structural node/child accessors used by the body-event extractor
 * (`extract-body-events.ts`) — a thin, generically-typed layer over the
 * CST's `children` maps, since `java-parser`'s own generated `*Ctx` types
 * don't cover every rule we walk here.
 */
export function childNode(node: unknown, key: string): GenericCstNode | undefined {
  if (!isCstNode(node)) {
    return undefined;
  }
  const child = node.children[key]?.[0];
  return isCstNode(child) ? child : undefined;
}

export function childNodes(node: unknown, key: string): readonly GenericCstNode[] {
  if (!isCstNode(node)) {
    return [];
  }
  return (node.children[key] ?? []).filter(isCstNode);
}

export function hasChild(node: unknown, key: string): boolean {
  return isCstNode(node) && node.children[key] !== undefined && node.children[key].length > 0;
}

/** Depth-first search for the first token whose `tokenType.name` matches. */
export function findFirstTokenImage(node: unknown, tokenTypeName: string): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstTokenImage(item, tokenTypeName);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (isToken(node)) {
    return node.tokenType?.name === tokenTypeName ? node.image : undefined;
  }
  if (isCstNode(node)) {
    for (const value of Object.values(node.children)) {
      const found = findFirstTokenImage(value, tokenTypeName);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/** Depth-first collection of every token image whose `tokenType.name` matches, in source order. */
export function findAllTokenImages(node: unknown, tokenTypeName: string): string[] {
  const out: string[] = [];

  function visit(current: unknown): void {
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item);
      }
      return;
    }
    if (isToken(current)) {
      if (current.tokenType?.name === tokenTypeName) {
        out.push(current.image);
      }
      return;
    }
    if (isCstNode(current)) {
      for (const value of Object.values(current.children)) {
        visit(value);
      }
    }
  }

  visit(node);
  return out;
}

/** Strips the surrounding double quotes from a raw `StringLiteral` token image. */
export function unquoteStringLiteral(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }
  return raw;
}
