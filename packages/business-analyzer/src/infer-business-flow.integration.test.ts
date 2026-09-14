import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverApis } from '@flowscope/parser-spring';
import { parseJavaFiles } from '@flowscope/parser-java';
import { describe, expect, it } from 'vitest';
import { inferBusinessFlow } from './infer-business-flow';
import type { BusinessFlow } from './business-flow';

const currentDir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(currentDir, '../../../tests/fixtures/simple-customer-service');
const FIXTURE_PACKAGE = 'src/main/java/com/flowscope/fixtures/customer';
const JAVA_FILES = [
  `${FIXTURE_PACKAGE}/Customer.java`,
  `${FIXTURE_PACKAGE}/CustomerApplication.java`,
  `${FIXTURE_PACKAGE}/CustomerController.java`,
  `${FIXTURE_PACKAGE}/CustomerService.java`,
];

/** `businessName` keyed by step id, for readable edge assertions. */
function namesById(flow: BusinessFlow): ReadonlyMap<string, string> {
  return new Map(flow.steps.map((step) => [step.id, step.businessName]));
}

describe('inferBusinessFlow — against the real fixture', () => {
  it('builds a real branching graph for POST /customers: a decision with two distinct outgoing edges', async () => {
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

    const { steps, edges } = result.value;
    const names = namesById(result.value);

    expect(steps.map((step) => `${step.type}:${step.businessName}`)).toEqual([
      'business-step:Register Customer',
      'decision:Check if Customer Exists by Email',
      'error:Reject Customer',
      'transformation:Generate Customer',
      'database-operation:Save Customer',
      'response:Return Response',
    ]);

    // The decision has exactly two outgoing edges — a real branch, not a
    // flattened chain — one to the rejection, one resuming normal flow.
    const decisionId = steps.find((s) => s.businessName.startsWith('Check if Customer Exists'))?.id;
    expect(decisionId).toBeDefined();
    const outgoing = edges.filter((edge) => edge.from === decisionId);
    expect(outgoing).toHaveLength(2);

    const rejectionEdge = outgoing.find((edge) => names.get(edge.to) === 'Reject Customer');
    const continueEdge = outgoing.find((edge) => names.get(edge.to) === 'Generate Customer');
    expect(rejectionEdge).toMatchObject({ type: 'error', label: 'Yes' });
    expect(continueEdge).toMatchObject({ type: 'success', label: 'No' });

    // The rejection is a dead end — nothing continues from it.
    expect(edges.some((edge) => edge.from === rejectionEdge?.to)).toBe(false);

    // The rest of the happy path chains sequentially.
    const generateId = continueEdge?.to;
    const saveEdge = edges.find((edge) => edge.from === generateId);
    expect(saveEdge).toMatchObject({ type: 'sequence' });
    expect(names.get(saveEdge?.to ?? '')).toBe('Save Customer');
    const returnEdge = edges.find((edge) => edge.from === saveEdge?.to);
    expect(names.get(returnEdge?.to ?? '')).toBe('Return Response');

    expect(edges).toHaveLength(5);
    for (const step of steps) {
      expect(step.confidence).toBeGreaterThan(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }
    expect(steps[0]?.source).toEqual({
      file: `${FIXTURE_PACKAGE}/CustomerController.java`,
      lineStart: 22,
      lineEnd: 22,
      method: 'register',
      className: 'CustomerController',
    });
  });

  it('builds a real branching graph for GET /customers/{id}, with Yes/No matching the phrased question rather than raw Java truth', async () => {
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

    const { steps, edges } = result.value;
    const names = namesById(result.value);

    expect(steps.map((step) => `${step.type}:${step.businessName}`)).toEqual([
      'business-step:Find Customer by Id',
      'business-step:Find Customer',
      'decision:Check if Customer was Found',
      'error:Return Not Found Response',
      'response:Return Response',
    ]);

    const decisionId = steps.find((s) => s.businessName === 'Check if Customer was Found')?.id;
    const outgoing = edges.filter((edge) => edge.from === decisionId);
    expect(outgoing).toHaveLength(2);

    // The raw Java condition (`customer == null`) being true means the
    // customer was NOT found — the "No" answer to "was it found?", even
    // though it's the guard-clause branch. Getting this backwards would
    // mislead a reader of the rendered flowchart.
    const notFoundEdge = outgoing.find(
      (edge) => names.get(edge.to) === 'Return Not Found Response',
    );
    const foundEdge = outgoing.find((edge) => names.get(edge.to) === 'Return Response');
    expect(notFoundEdge).toMatchObject({ type: 'error', label: 'No' });
    expect(foundEdge).toMatchObject({ type: 'success', label: 'Yes' });

    expect(edges).toHaveLength(4);
  });

  it('produces two distinct flows (different step/edge counts) for the two different APIs', async () => {
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
