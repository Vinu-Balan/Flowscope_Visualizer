import type { AnnotationCstNode, AnnotationCtx, ElementValueCstNode } from 'java-parser';
import type { JavaAnnotation } from './java-model';
import { findAllTokenImages, findFirstTokenImage, unquoteStringLiteral } from './cst-utils';

interface ExtractedElementValue {
  readonly stringLiteral?: string | undefined;
  readonly identifierChains: string[];
}

/**
 * Extracts a single `elementValue` — either a plain expression (we only
 * care about string literals and identifier/enum-constant references, see
 * java-model.ts) or an array initializer, e.g.
 * `{RequestMethod.GET, RequestMethod.HEAD}`, recursed item by item so each
 * array entry contributes its own dot-joined identifier chain rather than
 * all being flattened together.
 */
function extractElementValue(node: ElementValueCstNode): ExtractedElementValue {
  const arrayInit = node.children.elementValueArrayInitializer?.[0];
  if (arrayInit) {
    const list = arrayInit.children.elementValueList?.[0];
    const items = list?.children.elementValue ?? [];

    let stringLiteral: string | undefined;
    const identifierChains: string[] = [];
    for (const item of items) {
      const extracted = extractElementValue(item);
      if (stringLiteral === undefined) {
        stringLiteral = extracted.stringLiteral;
      }
      identifierChains.push(...extracted.identifierChains);
    }
    return { stringLiteral, identifierChains };
  }

  const rawStringLiteral = findFirstTokenImage(node, 'StringLiteral');
  const identifiers = findAllTokenImages(node, 'Identifier');
  return {
    stringLiteral:
      rawStringLiteral === undefined ? undefined : unquoteStringLiteral(rawStringLiteral),
    identifierChains: identifiers.length > 0 ? [identifiers.join('.')] : [],
  };
}

/**
 * Extracts one annotation's simple name and arguments (docs/adr/ADR-006).
 * A bare single value like `@GetMapping("/x")` is normalized under the
 * implicit "value" key, matching Java's own annotation semantics.
 */
export function extractAnnotation(node: AnnotationCstNode): JavaAnnotation {
  const ctx: AnnotationCtx = node.children;
  const nameTokens = ctx.typeName[0]?.children.Identifier ?? [];
  const lastNameToken = nameTokens[nameTokens.length - 1];
  const name = lastNameToken ? lastNameToken.image : '';

  const stringArguments: Record<string, string> = {};
  const identifierArguments: Record<string, string[]> = {};

  const pairList = ctx.elementValuePairList?.[0];
  if (pairList) {
    for (const pair of pairList.children.elementValuePair) {
      const paramNameToken = pair.children.Identifier[0];
      const valueNode = pair.children.elementValue[0];
      if (!paramNameToken || !valueNode) {
        continue;
      }
      const extracted = extractElementValue(valueNode);
      if (extracted.stringLiteral !== undefined) {
        stringArguments[paramNameToken.image] = extracted.stringLiteral;
      }
      if (extracted.identifierChains.length > 0) {
        identifierArguments[paramNameToken.image] = extracted.identifierChains;
      }
    }
  } else {
    const bareValue = ctx.elementValue?.[0];
    if (bareValue) {
      const extracted = extractElementValue(bareValue);
      if (extracted.stringLiteral !== undefined) {
        stringArguments.value = extracted.stringLiteral;
      }
      if (extracted.identifierChains.length > 0) {
        identifierArguments.value = extracted.identifierChains;
      }
    }
  }

  return { name, stringArguments, identifierArguments };
}

/** A class/method modifier list's shape, structurally common to both (see java-parser's ClassModifierCtx/MethodModifierCtx). */
interface ModifierWithAnnotation {
  readonly children: { readonly annotation?: readonly AnnotationCstNode[] };
}

export function extractAnnotationsFromModifiers(
  modifiers: readonly ModifierWithAnnotation[] | undefined,
): JavaAnnotation[] {
  const annotations: JavaAnnotation[] = [];
  for (const modifier of modifiers ?? []) {
    for (const annotationNode of modifier.children.annotation ?? []) {
      annotations.push(extractAnnotation(annotationNode));
    }
  }
  return annotations;
}
