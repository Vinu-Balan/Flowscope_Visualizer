/**
 * Small, generic helpers for pulling specific tokens out of an arbitrary
 * java-parser CST subtree, without hand-writing the exact grammar path to
 * every construct we care about (e.g. a string literal buried inside
 * `elementValue -> conditionalExpression -> ... -> literal`). Deliberately
 * generic rather than exhaustive — see ADR-006.
 */

interface GenericToken {
  readonly image: string;
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
