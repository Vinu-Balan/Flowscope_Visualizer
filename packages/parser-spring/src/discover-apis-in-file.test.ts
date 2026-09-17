import type { JavaAnnotation, JavaMethod, JavaSourceFile, JavaType } from '@flowscope/parser-java';
import { describe, expect, it } from 'vitest';
import { discoverApisInFile } from './discover-apis-in-file';

function annotation(
  name: string,
  stringArguments: Record<string, string> = {},
  identifierArguments: Record<string, string[]> = {},
): JavaAnnotation {
  return { name, stringArguments, identifierArguments };
}

function method(overrides: Partial<JavaMethod> & Pick<JavaMethod, 'name'>): JavaMethod {
  return { annotations: [], line: 1, parameterCount: 0, bodyEvents: [], ...overrides };
}

function javaType(overrides: Partial<JavaType> & Pick<JavaType, 'name'>): JavaType {
  return { kind: 'class', annotations: [], methods: [], fields: [], line: 1, ...overrides };
}

function sourceFile(types: JavaType[]): JavaSourceFile {
  return { packageName: 'com.example', types };
}

describe('discoverApisInFile', () => {
  it('finds nothing in a class with no controller annotation', () => {
    const model = sourceFile([
      javaType({
        name: 'PlainService',
        annotations: [annotation('Service')],
        methods: [
          method({
            name: 'doWork',
            annotations: [annotation('GetMapping', { value: '/x' })],
            line: 5,
          }),
        ],
      }),
    ]);
    expect(discoverApisInFile(model, 'Plain.java')).toEqual([]);
  });

  it('combines a class-level @RequestMapping base path with method shorthand annotations', () => {
    const model = sourceFile([
      javaType({
        name: 'CustomerController',
        annotations: [
          annotation('RestController'),
          annotation('RequestMapping', { value: '/customers' }),
        ],
        methods: [
          method({ name: 'register', annotations: [annotation('PostMapping')], line: 10 }),
          method({
            name: 'findById',
            annotations: [annotation('GetMapping', { value: '/{id}' })],
            line: 15,
          }),
        ],
      }),
    ]);

    expect(discoverApisInFile(model, 'CustomerController.java')).toEqual([
      {
        id: 'POST /customers#CustomerController.java:register',
        httpMethod: 'POST',
        path: '/customers',
        className: 'CustomerController',
        methodName: 'register',
        file: 'CustomerController.java',
        line: 10,
      },
      {
        id: 'GET /customers/{id}#CustomerController.java:findById',
        httpMethod: 'GET',
        path: '/customers/{id}',
        className: 'CustomerController',
        methodName: 'findById',
        file: 'CustomerController.java',
        line: 15,
      },
    ]);
  });

  it('recognizes @Controller as well as @RestController', () => {
    const model = sourceFile([
      javaType({
        name: 'ViewController',
        annotations: [annotation('Controller')],
        methods: [
          method({
            name: 'home',
            annotations: [annotation('GetMapping', { value: '/home' })],
            line: 3,
          }),
        ],
      }),
    ]);
    expect(discoverApisInFile(model, 'ViewController.java')).toHaveLength(1);
  });

  it('handles @RequestMapping(method = RequestMethod.X) generic form', () => {
    const model = sourceFile([
      javaType({
        name: 'OrderController',
        annotations: [annotation('RestController')],
        methods: [
          method({
            name: 'create',
            annotations: [
              annotation(
                'RequestMapping',
                { value: '/orders' },
                { method: ['RequestMethod.POST'] },
              ),
            ],
            line: 8,
          }),
        ],
      }),
    ]);
    const apis = discoverApisInFile(model, 'OrderController.java');
    expect(apis).toEqual([
      {
        id: 'POST /orders#OrderController.java:create',
        httpMethod: 'POST',
        path: '/orders',
        className: 'OrderController',
        methodName: 'create',
        file: 'OrderController.java',
        line: 8,
      },
    ]);
  });

  it('emits one API per HTTP method for an array of methods on @RequestMapping', () => {
    const model = sourceFile([
      javaType({
        name: 'OrderController',
        annotations: [annotation('RestController')],
        methods: [
          method({
            name: 'get',
            annotations: [
              annotation(
                'RequestMapping',
                { path: '/orders/{id}' },
                { method: ['RequestMethod.GET', 'RequestMethod.HEAD'] },
              ),
            ],
            line: 12,
          }),
        ],
      }),
    ]);
    const apis = discoverApisInFile(model, 'OrderController.java');
    // HEAD isn't one of MASTER_PLAN.md's supported methods (GET/POST/PUT/PATCH/DELETE) —
    // only the recognized subset is reported, never fabricated.
    expect(apis.map((a) => a.httpMethod)).toEqual(['GET']);
    expect(apis[0]?.path).toBe('/orders/{id}');
  });

  it('skips @RequestMapping with no explicit method rather than guessing', () => {
    const model = sourceFile([
      javaType({
        name: 'AmbiguousController',
        annotations: [annotation('RestController')],
        methods: [
          method({
            name: 'any',
            annotations: [annotation('RequestMapping', { value: '/x' })],
            line: 4,
          }),
        ],
      }),
    ]);
    expect(discoverApisInFile(model, 'Ambiguous.java')).toEqual([]);
  });

  it('uses an empty base path when the controller has no class-level @RequestMapping', () => {
    const model = sourceFile([
      javaType({
        name: 'RootController',
        annotations: [annotation('RestController')],
        methods: [
          method({
            name: 'ping',
            annotations: [annotation('GetMapping', { value: '/ping' })],
            line: 2,
          }),
        ],
      }),
    ]);
    expect(discoverApisInFile(model, 'Root.java')[0]?.path).toBe('/ping');
  });

  it('handles multiple controllers in the same file independently', () => {
    const model = sourceFile([
      javaType({
        name: 'A',
        annotations: [annotation('RestController'), annotation('RequestMapping', { value: '/a' })],
        methods: [method({ name: 'listA', annotations: [annotation('GetMapping')], line: 1 })],
      }),
      javaType({
        name: 'B',
        annotations: [annotation('RestController'), annotation('RequestMapping', { value: '/b' })],
        methods: [method({ name: 'listB', annotations: [annotation('GetMapping')], line: 1 })],
      }),
    ]);
    const apis = discoverApisInFile(model, 'Multi.java');
    expect(apis.map((a) => `${a.className}:${a.path}`)).toEqual(['A:/a', 'B:/b']);
  });
});

describe('discoverApisInFile — JAX-RS/Jersey (docs/sprints/SPRINT-11.md)', () => {
  it('combines a class-level @Path with a method-level @Path and HTTP-verb marker annotation', () => {
    const model = sourceFile([
      javaType({
        name: 'ProductResource',
        annotations: [annotation('Path', { value: '/products' })],
        methods: [
          method({ name: 'getAllProducts', annotations: [annotation('GET')], line: 10 }),
          method({
            name: 'getProduct',
            annotations: [annotation('GET'), annotation('Path', { value: '/{id}' })],
            line: 15,
          }),
          method({ name: 'createProduct', annotations: [annotation('POST')], line: 20 }),
        ],
      }),
    ]);

    expect(discoverApisInFile(model, 'ProductResource.java')).toEqual([
      {
        id: 'GET /products#ProductResource.java:getAllProducts',
        httpMethod: 'GET',
        path: '/products',
        className: 'ProductResource',
        methodName: 'getAllProducts',
        file: 'ProductResource.java',
        line: 10,
      },
      {
        id: 'GET /products/{id}#ProductResource.java:getProduct',
        httpMethod: 'GET',
        path: '/products/{id}',
        className: 'ProductResource',
        methodName: 'getProduct',
        file: 'ProductResource.java',
        line: 15,
      },
      {
        id: 'POST /products#ProductResource.java:createProduct',
        httpMethod: 'POST',
        path: '/products',
        className: 'ProductResource',
        methodName: 'createProduct',
        file: 'ProductResource.java',
        line: 20,
      },
    ]);
  });

  it('does not require a Spring @Controller/@RestController marker — a class-level @Path is enough', () => {
    const model = sourceFile([
      javaType({
        name: 'PlainResource',
        annotations: [annotation('Path', { value: '/plain' })],
        methods: [method({ name: 'list', annotations: [annotation('GET')], line: 1 })],
      }),
    ]);
    expect(discoverApisInFile(model, 'Plain.java')).toHaveLength(1);
  });

  it('skips a method with @Path but no HTTP-verb annotation, rather than guessing', () => {
    // A JAX-RS "sub-resource locator" — delegates to another resource at
    // runtime. Not modeled (same scope boundary as Spring's ambiguous
    // @RequestMapping, MASTER_PLAN.md §12: never fabricate the verb).
    const model = sourceFile([
      javaType({
        name: 'ParentResource',
        annotations: [annotation('Path', { value: '/parent' })],
        methods: [
          method({
            name: 'child',
            annotations: [annotation('Path', { value: '/child' })],
            line: 5,
          }),
        ],
      }),
    ]);
    expect(discoverApisInFile(model, 'Parent.java')).toEqual([]);
  });

  it('uses the class path as-is when a method has no method-level @Path', () => {
    const model = sourceFile([
      javaType({
        name: 'RootResource',
        annotations: [annotation('Path', { value: '/root' })],
        methods: [method({ name: 'ping', annotations: [annotation('DELETE')], line: 2 })],
      }),
    ]);
    expect(discoverApisInFile(model, 'Root.java')[0]?.path).toBe('/root');
  });

  it('finds both a Spring MVC controller and a JAX-RS resource in the same file independently', () => {
    const model = sourceFile([
      javaType({
        name: 'SpringOne',
        annotations: [annotation('RestController'), annotation('RequestMapping', { value: '/a' })],
        methods: [method({ name: 'listA', annotations: [annotation('GetMapping')], line: 1 })],
      }),
      javaType({
        name: 'JerseyOne',
        annotations: [annotation('Path', { value: '/b' })],
        methods: [method({ name: 'listB', annotations: [annotation('GET')], line: 1 })],
      }),
    ]);
    const apis = discoverApisInFile(model, 'Multi.java');
    expect(apis.map((a) => `${a.className}:${a.path}`)).toEqual(['SpringOne:/a', 'JerseyOne:/b']);
  });
});
