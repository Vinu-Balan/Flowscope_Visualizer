import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanProject } from './scan-project';

const currentDir = dirname(fileURLToPath(import.meta.url));
const CUSTOMER_SERVICE_FIXTURE = resolve(
  currentDir,
  '../../../tests/fixtures/simple-customer-service',
);

async function writeFileDeep(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

describe('scanProject', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flowscope-scanner-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('classifies main, test, and non-standard Java files separately', async () => {
    await writeFileDeep(join(dir, 'src/main/java/com/example/App.java'), 'class App {}');
    await writeFileDeep(join(dir, 'src/test/java/com/example/AppTest.java'), 'class AppTest {}');
    await writeFileDeep(join(dir, 'scripts/Generate.java'), 'class Generate {}');

    const result = await scanProject(dir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bySourceSet = Object.fromEntries(
      result.value.javaFiles.map((f) => [f.path, f.sourceSet]),
    );
    expect(bySourceSet).toEqual({
      'src/main/java/com/example/App.java': 'main',
      'src/test/java/com/example/AppTest.java': 'test',
      'scripts/Generate.java': 'other',
    });
  });

  it('discovers resource files under src/main/resources and src/test/resources regardless of extension', async () => {
    await writeFileDeep(join(dir, 'src/main/resources/application.yml'), 'server: {}');
    await writeFileDeep(join(dir, 'src/main/resources/static/logo.svg'), '<svg></svg>');
    await writeFileDeep(join(dir, 'src/test/resources/test.properties'), 'a=b');
    await writeFileDeep(join(dir, 'README.md'), '# not a resource');

    const result = await scanProject(dir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.resourceFiles.map((f) => f.path).sort();
    expect(paths).toEqual([
      'src/main/resources/application.yml',
      'src/main/resources/static/logo.svg',
      'src/test/resources/test.properties',
    ]);
    // README.md is a real file, counted in totals, but not a Java or resource file.
    expect(result.value.totalFilesScanned).toBe(4);
  });

  it('excludes build output, VCS, and IDE directories from the walk', async () => {
    await writeFileDeep(join(dir, 'src/main/java/com/example/Kept.java'), 'class Kept {}');
    await writeFileDeep(join(dir, 'target/classes/com/example/Excluded.java'), 'class Excluded {}');
    await writeFileDeep(join(dir, 'build/Excluded.java'), 'class Excluded {}');
    await writeFileDeep(join(dir, 'node_modules/pkg/Excluded.java'), 'class Excluded {}');
    await writeFileDeep(join(dir, '.git/Excluded.java'), 'class Excluded {}');
    await writeFileDeep(join(dir, '.idea/Excluded.java'), 'class Excluded {}');

    const result = await scanProject(dir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.javaFiles.map((f) => f.path)).toEqual([
      'src/main/java/com/example/Kept.java',
    ]);
    expect(result.value.totalDirectoriesSkipped).toBe(5);
  });

  it('computes a correct sha256 content hash', async () => {
    const content = 'class Hashed {}';
    await writeFileDeep(join(dir, 'src/main/java/Hashed.java'), content);
    const expectedHash = createHash('sha256').update(content).digest('hex');

    const result = await scanProject(dir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.javaFiles[0]?.contentHash).toBe(expectedHash);
  });

  it('returns an AnalysisError when the project root does not exist', async () => {
    const result = await scanProject(join(dir, 'does-not-exist'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ANALYSIS_ERROR');
  });

  it('returns an empty-but-successful result for a project with no Java or resource files', async () => {
    await writeFileDeep(join(dir, 'pom.xml'), '<project></project>');

    const result = await scanProject(dir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.javaFiles).toEqual([]);
    expect(result.value.resourceFiles).toEqual([]);
    expect(result.value.totalFilesScanned).toBe(1);
  });

  it('scans the real simple-customer-service fixture correctly', async () => {
    const result = await scanProject(CUSTOMER_SERVICE_FIXTURE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mainFiles = result.value.javaFiles
      .filter((f) => f.sourceSet === 'main')
      .map((f) => f.path);
    const testFiles = result.value.javaFiles
      .filter((f) => f.sourceSet === 'test')
      .map((f) => f.path);

    expect(mainFiles.sort()).toEqual(
      [
        'src/main/java/com/flowscope/fixtures/customer/Customer.java',
        'src/main/java/com/flowscope/fixtures/customer/CustomerApplication.java',
        'src/main/java/com/flowscope/fixtures/customer/CustomerController.java',
        'src/main/java/com/flowscope/fixtures/customer/CustomerService.java',
      ].sort(),
    );
    expect(testFiles).toEqual([
      'src/test/java/com/flowscope/fixtures/customer/CustomerServiceTest.java',
    ]);
    expect(result.value.resourceFiles.map((f) => f.path)).toEqual([
      'src/main/resources/application.properties',
    ]);
    expect(result.value.javaFiles.every((f) => f.contentHash.length === 64)).toBe(true);
  });
});
