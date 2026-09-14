import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateProject } from './validate-project';

describe('validateProject', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flowscope-workspace-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a Maven project via pom.xml', async () => {
    await writeFile(join(dir, 'pom.xml'), '<project></project>', 'utf8');

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.buildSystem).toBe('maven');
      expect(result.value.buildFile).toBe('pom.xml');
      expect(result.value.looksLikeSpringBoot).toBe(false);
    }
  });

  it('detects a Gradle (Groovy) project via build.gradle', async () => {
    await writeFile(join(dir, 'build.gradle'), "plugins { id 'java' }", 'utf8');

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.buildSystem).toBe('gradle');
      expect(result.value.buildFile).toBe('build.gradle');
    }
  });

  it('detects a Gradle (Kotlin DSL) project via build.gradle.kts', async () => {
    await writeFile(join(dir, 'build.gradle.kts'), 'plugins { java }', 'utf8');

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.buildSystem).toBe('gradle');
      expect(result.value.buildFile).toBe('build.gradle.kts');
    }
  });

  it('detects a multi-module Gradle project that only has settings.gradle at the root', async () => {
    await writeFile(join(dir, 'settings.gradle'), "rootProject.name = 'demo'", 'utf8');

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.buildSystem).toBe('gradle');
      expect(result.value.buildFile).toBe('settings.gradle');
    }
  });

  it('prefers pom.xml over a Gradle file when both are somehow present', async () => {
    await writeFile(join(dir, 'pom.xml'), '<project></project>', 'utf8');
    await writeFile(join(dir, 'build.gradle'), '', 'utf8');

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.buildSystem).toBe('maven');
    }
  });

  it('sets looksLikeSpringBoot when the build file mentions spring-boot', async () => {
    await writeFile(
      join(dir, 'pom.xml'),
      '<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>',
      'utf8',
    );

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.looksLikeSpringBoot).toBe(true);
    }
  });

  it('derives name from the directory basename', async () => {
    const projectDir = join(dir, 'my-cool-service');
    await mkdir(projectDir);
    await writeFile(join(projectDir, 'pom.xml'), '<project></project>', 'utf8');

    const result = await validateProject(projectDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('my-cool-service');
    }
  });

  it('returns UnsupportedProjectError for a real directory with no build file', async () => {
    const result = await validateProject(dir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNSUPPORTED_PROJECT');
    }
  });

  it('returns ProjectNotFoundError for a path that does not exist', async () => {
    const result = await validateProject(join(dir, 'does-not-exist'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PROJECT_NOT_FOUND');
    }
  });

  it('returns InvalidProjectError when the path is a file, not a directory', async () => {
    const filePath = join(dir, 'not-a-folder.txt');
    await writeFile(filePath, 'hello', 'utf8');

    const result = await validateProject(filePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PROJECT');
    }
  });

  it('produces a stable id equal to the resolved path', async () => {
    await writeFile(join(dir, 'pom.xml'), '<project></project>', 'utf8');

    const result = await validateProject(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(result.value.path);
    }
  });
});
