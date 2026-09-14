import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverApis } from './discover-apis';

async function writeFileDeep(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

const CONTROLLER_SOURCE = `
  package com.example;

  @RestController
  @RequestMapping("/widgets")
  public class WidgetController {
      @GetMapping
      public void list() {}

      @PostMapping
      public void create() {}
  }
`;

const NOT_A_CONTROLLER_SOURCE = `
  package com.example;

  @Service
  public class WidgetService {
      public void doWork() {}
  }
`;

describe('discoverApis', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flowscope-parser-spring-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('discovers APIs across multiple files and reports parsed/failed counts', async () => {
    await writeFileDeep(
      join(dir, 'src/main/java/com/example/WidgetController.java'),
      CONTROLLER_SOURCE,
    );
    await writeFileDeep(
      join(dir, 'src/main/java/com/example/WidgetService.java'),
      NOT_A_CONTROLLER_SOURCE,
    );

    const result = await discoverApis(dir, [
      'src/main/java/com/example/WidgetController.java',
      'src/main/java/com/example/WidgetService.java',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsedFileCount).toBe(2);
    expect(result.value.failedFileCount).toBe(0);
    expect(result.value.apis.map((a) => `${a.httpMethod} ${a.path}`).sort()).toEqual([
      'GET /widgets',
      'POST /widgets',
    ]);
  });

  it('skips an unreadable file without failing the whole operation', async () => {
    await writeFileDeep(
      join(dir, 'src/main/java/com/example/WidgetController.java'),
      CONTROLLER_SOURCE,
    );

    const result = await discoverApis(dir, [
      'src/main/java/com/example/WidgetController.java',
      'src/main/java/com/example/DoesNotExist.java',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsedFileCount).toBe(1);
    expect(result.value.failedFileCount).toBe(1);
    expect(result.value.apis).toHaveLength(2);
  });

  it('skips a file with malformed Java without failing the whole operation', async () => {
    await writeFileDeep(
      join(dir, 'src/main/java/com/example/WidgetController.java'),
      CONTROLLER_SOURCE,
    );
    await writeFileDeep(join(dir, 'src/main/java/com/example/Broken.java'), 'this is not java {{{');

    const result = await discoverApis(dir, [
      'src/main/java/com/example/WidgetController.java',
      'src/main/java/com/example/Broken.java',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsedFileCount).toBe(1);
    expect(result.value.failedFileCount).toBe(1);
  });

  it('returns an empty result for an empty file list', async () => {
    const result = await discoverApis(dir, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ apis: [], parsedFileCount: 0, failedFileCount: 0 });
  });

  it('returns an AnalysisError when the project root does not exist', async () => {
    const result = await discoverApis(join(dir, 'does-not-exist'), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ANALYSIS_ERROR');
  });
});
