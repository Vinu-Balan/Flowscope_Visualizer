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

  it('discovers a real JAX-RS/Jersey resource, registered via a JerseyConfig-style ResourceConfig (docs/sprints/SPRINT-11.md)', () => {
    // The real JAX-RS idiom: a class-level @Path base, a bare @GET/@POST/etc.
    // marker per method (never combined with the path the way Spring's
    // @GetMapping is), and an optional method-level @Path suffix.
    // `javax.ws.rs.*` here — `jakarta.ws.rs.*` extracts identically, since
    // ADR-006 never resolves imports.
    const resourceSource = `
      package com.example;

      import javax.ws.rs.GET;
      import javax.ws.rs.POST;
      import javax.ws.rs.Path;
      import javax.ws.rs.PathParam;
      import javax.ws.rs.Produces;
      import javax.ws.rs.core.MediaType;

      @Path("/products")
      @Produces(MediaType.APPLICATION_JSON)
      public class ProductResource {

          @GET
          public Response getAllProducts() {
              return null;
          }

          @GET
          @Path("/{id}")
          public Response getProduct(@PathParam("id") Long id) {
              return null;
          }

          @POST
          public Response createProduct(Product product) {
              return null;
          }
      }
    `;
    // The registration class itself declares no endpoints of its own —
    // discovery works directly off the resource class's own annotations,
    // not off this registration (see discoverJaxRsMethodApis's doc comment).
    const configSource = `
      package com.example;

      import org.glassfish.jersey.server.ResourceConfig;
      import org.springframework.stereotype.Component;

      @Component
      public class JerseyConfig extends ResourceConfig {
          public JerseyConfig() {
              register(ProductResource.class);
              packages("com.example");
          }
      }
    `;

    const parsedResource = parseJavaFile(resourceSource);
    expect(parsedResource.ok).toBe(true);
    if (!parsedResource.ok) return;
    const apis = discoverApisInFile(parsedResource.value, 'ProductResource.java');
    expect(apis.map((a) => `${a.httpMethod} ${a.path}`)).toEqual([
      'GET /products',
      'GET /products/{id}',
      'POST /products',
    ]);
    expect(apis.every((a) => a.className === 'ProductResource')).toBe(true);

    const parsedConfig = parseJavaFile(configSource);
    expect(parsedConfig.ok).toBe(true);
    if (!parsedConfig.ok) return;
    expect(discoverApisInFile(parsedConfig.value, 'JerseyConfig.java')).toEqual([]);
  });
});
