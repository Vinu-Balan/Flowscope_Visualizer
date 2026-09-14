import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverApis } from '@flowscope/parser-spring';
import { parseJavaFiles } from '@flowscope/parser-java';
import { describe, expect, it } from 'vitest';
import { inferBusinessFlow } from './infer-business-flow';

const currentDir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(currentDir, '../../../tests/fixtures/simple-customer-service');
const FIXTURE_PACKAGE = 'src/main/java/com/flowscope/fixtures/customer';
const JAVA_FILES = [
  `${FIXTURE_PACKAGE}/Customer.java`,
  `${FIXTURE_PACKAGE}/CustomerApplication.java`,
  `${FIXTURE_PACKAGE}/CustomerController.java`,
  `${FIXTURE_PACKAGE}/CustomerService.java`,
];

describe('inferBusinessFlow — against the real fixture', () => {
  it('infers a decision, rejection, generation, save, and response for POST /customers', async () => {
    const discovered = await discoverApis(FIXTURE_ROOT, JAVA_FILES);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) return;
    const registerApi = discovered.value.apis.find((api) => api.methodName === 'register');
    expect(registerApi).toBeDefined();
    if (!registerApi) return;

    const parsed = await parseJavaFiles(FIXTURE_ROOT, JAVA_FILES);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = inferBusinessFlow(registerApi, parsed.value.files);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { steps } = result.value;
    expect(steps.map((step) => `${step.type}:${step.businessName}`)).toEqual([
      'business-step:Register Customer',
      'decision:Check if Customer Exists by Email',
      'error:Reject Customer',
      'transformation:Generate Customer',
      'database-operation:Save Customer',
      'response:Return Response',
    ]);

    // The rejection follows the decision via an 'error' edge, and the
    // step resuming the happy path afterward is flagged 'conditional' —
    // it only happens when the guard's condition was false
    // (docs/sprints/SPRINT-5.md).
    expect(steps.map((step) => step.incomingEdgeType)).toEqual([
      'sequence',
      'sequence',
      'error',
      'conditional',
      'sequence',
      'sequence',
    ]);

    // Every step carries a confidence in [0, 1] and never claims certainty.
    for (const step of steps) {
      expect(step.confidence).toBeGreaterThan(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }

    // Source provenance points at real files/lines, enabling later "Open Source" navigation.
    expect(steps[0]?.source).toEqual({
      file: `${FIXTURE_PACKAGE}/CustomerController.java`,
      lineStart: 22,
      lineEnd: 22,
      method: 'register',
      className: 'CustomerController',
    });
    expect(steps[1]?.source.file).toBe(`${FIXTURE_PACKAGE}/CustomerService.java`);
  });

  it('infers a lookup, not-found decision, error response, and success response for GET /customers/{id}', async () => {
    const discovered = await discoverApis(FIXTURE_ROOT, JAVA_FILES);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) return;
    const findByIdApi = discovered.value.apis.find((api) => api.methodName === 'findById');
    expect(findByIdApi).toBeDefined();
    if (!findByIdApi) return;

    const parsed = await parseJavaFiles(FIXTURE_ROOT, JAVA_FILES);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = inferBusinessFlow(findByIdApi, parsed.value.files);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { steps } = result.value;
    expect(steps.map((step) => `${step.type}:${step.businessName}`)).toEqual([
      'business-step:Find Customer by Id',
      'business-step:Find Customer',
      'decision:Check if Customer was Found',
      'error:Return Not Found Response',
      'response:Return Response',
    ]);
    expect(steps.map((step) => step.incomingEdgeType)).toEqual([
      'sequence',
      'sequence',
      'sequence',
      'error',
      'conditional',
    ]);
  });

  it('produces two distinct flows (different step counts/content) for the two different APIs', async () => {
    const discovered = await discoverApis(FIXTURE_ROOT, JAVA_FILES);
    const parsed = await parseJavaFiles(FIXTURE_ROOT, JAVA_FILES);
    expect(discovered.ok).toBe(true);
    expect(parsed.ok).toBe(true);
    if (!discovered.ok || !parsed.ok) return;

    const registerApi = discovered.value.apis.find((api) => api.methodName === 'register');
    const findByIdApi = discovered.value.apis.find((api) => api.methodName === 'findById');
    if (!registerApi || !findByIdApi) throw new Error('fixture APIs not found');

    const registerFlow = inferBusinessFlow(registerApi, parsed.value.files);
    const findByIdFlow = inferBusinessFlow(findByIdApi, parsed.value.files);
    expect(registerFlow.ok).toBe(true);
    expect(findByIdFlow.ok).toBe(true);
    if (!registerFlow.ok || !findByIdFlow.ok) return;

    expect(registerFlow.value.steps.length).not.toBe(findByIdFlow.value.steps.length);
    expect(registerFlow.value.apiId).not.toBe(findByIdFlow.value.apiId);
  });
});
