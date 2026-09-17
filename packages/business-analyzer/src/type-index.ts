import type { JavaProjectFile, JavaType } from '@flowscope/parser-java';

export interface TypeIndexEntry {
  readonly relativePath: string;
  readonly type: JavaType;
}

/**
 * Simple-class-name → declaring file/type, across every parsed file in the
 * project, plus a reverse index of interface simple name → every `class`
 * in the project that `implements` it. The reverse index is what lets a
 * field typed as a service interface (`private CommentService
 * commentService;`, the standard Spring interface+impl pattern) resolve to
 * its real implementing class instead of the interface's own bodyless
 * method (docs/sprints/SPRINT-13.md) — see `resolveCall` in
 * `infer-business-flow.ts`. Simple-name only, first declaration wins on a
 * collision — same documented heuristic as annotation matching (ADR-006).
 */
export interface ProjectTypeIndex {
  readonly byName: ReadonlyMap<string, TypeIndexEntry>;
  readonly implementorsByInterfaceName: ReadonlyMap<string, readonly TypeIndexEntry[]>;
}

export function buildTypeIndex(files: readonly JavaProjectFile[]): ProjectTypeIndex {
  const byName = new Map<string, TypeIndexEntry>();
  const implementorsByInterfaceName = new Map<string, TypeIndexEntry[]>();

  for (const file of files) {
    for (const type of file.model.types) {
      if (!byName.has(type.name)) {
        byName.set(type.name, { relativePath: file.relativePath, type });
      }
      if (type.kind === 'class') {
        for (const interfaceName of type.implementsTypes) {
          const entry: TypeIndexEntry = { relativePath: file.relativePath, type };
          const existing = implementorsByInterfaceName.get(interfaceName);
          if (existing) {
            existing.push(entry);
          } else {
            implementorsByInterfaceName.set(interfaceName, [entry]);
          }
        }
      }
    }
  }

  return { byName, implementorsByInterfaceName };
}

/**
 * Picks which real implementation to follow when a field's declared type
 * is an interface with one or more classes implementing it in the
 * project. A single implementation is unambiguous. With more than one,
 * prefers the shortest name that starts with the interface's own name —
 * the extremely common `<Interface>Impl`/`<Interface>Implementation`
 * convention (found in the user's real InstagramClone project,
 * `docs/sprints/SPRINT-12.md`'s "Explicitly deferred") — falling back to
 * whichever was declared first (same first-wins heuristic as everywhere
 * else in this index) when no candidate follows that convention.
 */
export function pickImplementation(
  interfaceName: string,
  candidates: readonly TypeIndexEntry[] | undefined,
): TypeIndexEntry | undefined {
  if (!candidates || candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const conventional = candidates
    .filter((candidate) => candidate.type.name.startsWith(interfaceName))
    .sort((a, b) => a.type.name.length - b.type.name.length);
  return conventional[0] ?? candidates[0];
}
