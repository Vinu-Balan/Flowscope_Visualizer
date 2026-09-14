import { describe, expect, it } from 'vitest';
import { type ProjectScanResult, summarizeScan } from './scan-result';

function makeResult(overrides: Partial<ProjectScanResult> = {}): ProjectScanResult {
  return {
    projectPath: '/tmp/demo',
    scannedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 10,
    totalFilesScanned: 0,
    totalDirectoriesSkipped: 0,
    javaFiles: [],
    resourceFiles: [],
    ...overrides,
  };
}

describe('summarizeScan', () => {
  it('counts java files by source set', () => {
    const result = makeResult({
      javaFiles: [
        { path: 'src/main/java/A.java', sizeBytes: 1, contentHash: 'a', sourceSet: 'main' },
        { path: 'src/main/java/B.java', sizeBytes: 1, contentHash: 'b', sourceSet: 'main' },
        { path: 'src/test/java/ATest.java', sizeBytes: 1, contentHash: 'c', sourceSet: 'test' },
        { path: 'scripts/Gen.java', sizeBytes: 1, contentHash: 'd', sourceSet: 'other' },
      ],
      resourceFiles: [
        { path: 'src/main/resources/application.properties', sizeBytes: 1, contentHash: 'e' },
      ],
    });

    expect(summarizeScan(result)).toEqual({
      totalJavaFiles: 4,
      mainJavaFiles: 2,
      testJavaFiles: 1,
      otherJavaFiles: 1,
      totalResourceFiles: 1,
    });
  });

  it('handles an empty scan', () => {
    expect(summarizeScan(makeResult())).toEqual({
      totalJavaFiles: 0,
      mainJavaFiles: 0,
      testJavaFiles: 0,
      otherJavaFiles: 0,
      totalResourceFiles: 0,
    });
  });
});
