import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  InvalidProjectError,
  ProjectNotFoundError,
  UnsupportedProjectError,
  err,
  ok,
  type Result,
} from '@flowscope/core';
import type { BuildSystem, ValidatedProject } from './project';

const BUILD_FILE_CANDIDATES: ReadonlyArray<{
  readonly file: string;
  readonly buildSystem: BuildSystem;
}> = [
  { file: 'pom.xml', buildSystem: 'maven' },
  { file: 'build.gradle.kts', buildSystem: 'gradle' },
  { file: 'build.gradle', buildSystem: 'gradle' },
  { file: 'settings.gradle.kts', buildSystem: 'gradle' },
  { file: 'settings.gradle', buildSystem: 'gradle' },
];

const SPRING_BOOT_HEURISTIC_PATTERN = /spring-boot/i;
/** A real build file is at most a few hundred KB; anything past this is skipped rather than read fully. */
const MAX_HEURISTIC_READ_BYTES = 1024 * 1024;

export type ProjectValidationError =
  ProjectNotFoundError | InvalidProjectError | UnsupportedProjectError;

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Validates that `inputPath` is a real, readable directory containing a
 * Maven or Gradle project. Never throws — every failure mode is a typed
 * Result so the IPC handler can respond with a specific, honest message
 * instead of a generic failure (docs/sprints/SPRINT-2.md).
 *
 * `inputPath` reaches this function over IPC and could in principle be any
 * string the renderer sends. That's an accepted, low-risk surface: this
 * function only performs read-only stat/read calls the OS user could
 * already do themselves, and it returns a small derived summary — never a
 * raw directory listing or arbitrary file contents
 * (docs/architecture/security-architecture.md).
 */
export async function validateProject(
  inputPath: string,
): Promise<Result<ValidatedProject, ProjectValidationError>> {
  const path = resolve(inputPath);

  let stats;
  try {
    stats = await stat(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return err(
        new ProjectNotFoundError({ message: `No folder found at "${path}".`, context: { path } }),
      );
    }
    return err(
      new InvalidProjectError({
        message: `"${path}" could not be read.`,
        cause: error,
        context: { path },
      }),
    );
  }

  if (!stats.isDirectory()) {
    return err(
      new InvalidProjectError({ message: `"${path}" is not a folder.`, context: { path } }),
    );
  }

  try {
    await access(path, constants.R_OK);
  } catch (error) {
    return err(
      new InvalidProjectError({
        message: `"${path}" exists but isn't readable.`,
        cause: error,
        context: { path },
      }),
    );
  }

  for (const candidate of BUILD_FILE_CANDIDATES) {
    const buildFilePath = join(path, candidate.file);
    const buildFileStats = await stat(buildFilePath).catch(() => undefined);
    if (!buildFileStats?.isFile()) {
      continue;
    }

    return ok({
      id: path,
      path,
      name: basename(path),
      buildSystem: candidate.buildSystem,
      buildFile: candidate.file,
      looksLikeSpringBoot: await checkSpringBootHeuristic(buildFilePath, buildFileStats.size),
    });
  }

  return err(
    new UnsupportedProjectError({
      message: `No Maven (pom.xml) or Gradle (build.gradle) project found in "${basename(path)}".`,
      context: { path },
    }),
  );
}

async function checkSpringBootHeuristic(
  buildFilePath: string,
  sizeBytes: number,
): Promise<boolean> {
  if (sizeBytes > MAX_HEURISTIC_READ_BYTES) {
    return false;
  }
  try {
    const content = await readFile(buildFilePath, 'utf8');
    return SPRING_BOOT_HEURISTIC_PATTERN.test(content);
  } catch {
    return false;
  }
}
