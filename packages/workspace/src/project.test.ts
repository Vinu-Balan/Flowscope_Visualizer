import { describe, expect, it } from 'vitest';
import { ProjectValidationResultSchema, ValidatedProjectSchema } from './project';

const sampleProject = {
  id: '/tmp/demo',
  path: '/tmp/demo',
  name: 'demo',
  buildSystem: 'maven',
  buildFile: 'pom.xml',
  looksLikeSpringBoot: true,
};

describe('ValidatedProjectSchema', () => {
  it('accepts a well-formed project', () => {
    expect(ValidatedProjectSchema.safeParse(sampleProject).success).toBe(true);
  });

  it('rejects an unknown build system', () => {
    expect(ValidatedProjectSchema.safeParse({ ...sampleProject, buildSystem: 'npm' }).success).toBe(
      false,
    );
  });
});

describe('ProjectValidationResultSchema', () => {
  it('accepts a valid result', () => {
    const result = ProjectValidationResultSchema.safeParse({
      status: 'valid',
      project: sampleProject,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an invalid result', () => {
    const result = ProjectValidationResultSchema.safeParse({
      status: 'invalid',
      code: 'UNSUPPORTED_PROJECT',
      message: 'No build file found.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid result missing a message', () => {
    const result = ProjectValidationResultSchema.safeParse({
      status: 'invalid',
      code: 'UNSUPPORTED_PROJECT',
    });
    expect(result.success).toBe(false);
  });
});
