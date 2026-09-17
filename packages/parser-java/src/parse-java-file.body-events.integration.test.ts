import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseJavaFile } from './parse-java-file';

const currentDir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(currentDir, '../../../tests/fixtures/simple-customer-service');
const FIXTURE_PACKAGE = 'src/main/java/com/flowscope/fixtures/customer';

async function parseFixtureFile(fileName: string) {
  const source = await readFile(resolve(FIXTURE_ROOT, FIXTURE_PACKAGE, fileName), 'utf8');
  const result = parseJavaFile(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('parseJavaFile — body events against the real fixture', () => {
  it('extracts CustomerController.register: a call to the service, then a response return', async () => {
    const model = await parseFixtureFile('CustomerController.java');
    const controller = model.types.find((t) => t.name === 'CustomerController');
    expect(controller?.fields).toEqual([{ name: 'customerService', type: 'CustomerService' }]);

    const register = controller?.methods.find((m) => m.name === 'register');
    expect(register?.bodyEvents).toEqual([
      {
        kind: 'call',
        line: 23,
        targetName: 'customerService',
        methodName: 'register',
        argumentCount: 2,
        argumentsText: 'request.email(), request.fullName()',
      },
      {
        kind: 'return',
        line: 24,
        returnsCallTarget: 'ResponseEntity',
        returnsCallMethod: 'ok',
        returnsCallArgumentsText: 'customer',
      },
    ]);
  });

  it('extracts CustomerController.findById: a lookup, a not-found guard, then a response return', async () => {
    const model = await parseFixtureFile('CustomerController.java');
    const controller = model.types.find((t) => t.name === 'CustomerController');
    const findById = controller?.methods.find((m) => m.name === 'findById');

    expect(findById?.bodyEvents).toEqual([
      {
        kind: 'call',
        line: 29,
        targetName: 'customerService',
        methodName: 'findById',
        argumentCount: 1,
        argumentsText: 'id',
      },
      {
        kind: 'if',
        line: 30,
        conditionText: 'customer == null',
        guardThrows: false,
        guardReturns: true,
        hasConditionCall: false,
        thenEventCount: 1,
      },
      {
        kind: 'return',
        line: 31,
        returnsCallTarget: 'ResponseEntity',
        returnsCallMethod: 'notFound',
        returnsCallArgumentsText: '',
      },
      {
        kind: 'return',
        line: 33,
        returnsCallTarget: 'ResponseEntity',
        returnsCallMethod: 'ok',
        returnsCallArgumentsText: 'customer',
      },
    ]);
  });

  it('extracts CustomerService.register: an existence guard with rejection, generated construction, and a save', async () => {
    const model = await parseFixtureFile('CustomerService.java');
    const service = model.types.find((t) => t.name === 'CustomerService');
    expect(service?.fields).toEqual([{ name: 'customersById', type: 'Map' }]);

    const register = service?.methods.find((m) => m.name === 'register');
    expect(register?.bodyEvents).toEqual([
      {
        kind: 'if',
        line: 14,
        conditionText: 'existsByEmail(email)',
        guardThrows: true,
        guardReturns: false,
        hasConditionCall: true,
        thenEventCount: 1,
      },
      {
        kind: 'call',
        line: 14,
        targetName: '',
        methodName: 'existsByEmail',
        argumentCount: 1,
        argumentsText: 'email',
      },
      {
        kind: 'throw',
        line: 15,
        exceptionType: 'IllegalStateException',
        // The exception's message is `"Customer already exists: " + email` —
        // a concatenation, so only the leading literal is captured.
        exceptionMessage: 'Customer already exists: ',
        argumentsText: '"Customer already exists: " + email',
      },
      {
        kind: 'construct',
        line: 17,
        methodName: 'Customer',
        looksGenerated: true,
        argumentsText: 'UUID.randomUUID().toString(), email, fullName',
      },
      {
        kind: 'call',
        line: 18,
        targetName: 'customersById',
        methodName: 'put',
        argumentCount: 2,
        argumentsText: 'customer.getId(), customer',
      },
      { kind: 'return', line: 19, returnsIdentifier: 'customer' },
    ]);
  });

  it('extracts CustomerService.findById as a single lookup call and a bare return', async () => {
    const model = await parseFixtureFile('CustomerService.java');
    const service = model.types.find((t) => t.name === 'CustomerService');
    const findById = service?.methods.find((m) => m.name === 'findById');

    // `return customersById.get(id);` has no separate call event — the
    // call info lives on the 'return' event's returnsCallTarget/Method
    // fields (only if/local-var-decl/bare-statement calls get their own
    // 'call' event — see docs/sprints/SPRINT-5.md).
    expect(findById?.bodyEvents).toEqual([
      {
        kind: 'return',
        line: 27,
        returnsCallTarget: 'customersById',
        returnsCallMethod: 'get',
        returnsCallArgumentsText: 'id',
      },
    ]);
  });
});
