import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJavaFile } from '@flowscope/parser-java';
import { describe, expect, it } from 'vitest';
import { discoverApisInFile } from './discover-apis-in-file';

const currentDir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(currentDir, '../../../tests/fixtures/simple-customer-service');

describe('discoverApisInFile (integration with the real parser)', () => {
  it('discovers exactly the two endpoints in a hand-written controller', () => {
    const source = `
      package com.example;

      @RestController
      @RequestMapping("/customers")
      public class CustomerController {

          private final CustomerService customerService;

          public CustomerController(CustomerService customerService) {
              this.customerService = customerService;
          }

          @PostMapping
          public ResponseEntity<Customer> register(@RequestBody RegisterCustomerRequest request) {
              return null;
          }

          @GetMapping("/{id}")
          public ResponseEntity<Customer> findById(@PathVariable String id) {
              return null;
          }

          public record RegisterCustomerRequest(String email, String fullName) {}
      }
    `;
    const parsed = parseJavaFile(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const apis = discoverApisInFile(parsed.value, 'CustomerController.java');
    expect(apis.map((a) => `${a.httpMethod} ${a.path}`)).toEqual([
      'POST /customers',
      'GET /customers/{id}',
    ]);
    expect(apis.every((a) => a.className === 'CustomerController')).toBe(true);
  });

  it('discovers exactly the two endpoints in the real simple-customer-service fixture', async () => {
    const relativePath = 'src/main/java/com/flowscope/fixtures/customer/CustomerController.java';
    const source = await readFile(resolve(FIXTURE_ROOT, relativePath), 'utf8');

    const parsed = parseJavaFile(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const apis = discoverApisInFile(parsed.value, relativePath);
    expect(apis.map((a) => `${a.httpMethod} ${a.path}`)).toEqual([
      'POST /customers',
      'GET /customers/{id}',
    ]);
  });

  it('finds no APIs in the fixture service and entity classes (not controllers)', async () => {
    for (const file of ['CustomerService.java', 'Customer.java', 'CustomerApplication.java']) {
      const relativePath = `src/main/java/com/flowscope/fixtures/customer/${file}`;
      const source = await readFile(resolve(FIXTURE_ROOT, relativePath), 'utf8');
      const parsed = parseJavaFile(source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(discoverApisInFile(parsed.value, relativePath)).toEqual([]);
    }
  });
});
