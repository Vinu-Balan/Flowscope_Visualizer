import type { JavaProjectFile, JavaType } from '@flowscope/parser-java';

export interface TypeIndexEntry {
  readonly relativePath: string;
  readonly type: JavaType;
}

/**
 * Simple-class-name → declaring file/type, across every parsed file in
 * the project — lets a field's declared type (e.g. `CustomerService`)
 * resolve to the type that declares it, so a call can be followed across
 * files. Simple-name only, first declaration wins on a collision — same
 * documented heuristic as annotation matching (ADR-006).
 */
export function buildTypeIndex(
  files: readonly JavaProjectFile[],
): ReadonlyMap<string, TypeIndexEntry> {
  const index = new Map<string, TypeIndexEntry>();
  for (const file of files) {
    for (const type of file.model.types) {
      if (!index.has(type.name)) {
        index.set(type.name, { relativePath: file.relativePath, type });
      }
    }
  }
  return index;
}
