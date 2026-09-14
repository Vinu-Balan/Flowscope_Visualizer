import type { JavaAnnotation, JavaSourceFile, JavaType } from '@flowscope/parser-java';
import { describe, expect, it } from 'vitest';
import { discoverApisInFile } from './discover-apis-in-file';

function annotation(
  name: string,
  stringArguments: Record<string, string> = {},
  identifierArguments: Record<string, string[]> = {},
): JavaAnnotation {
  return { name, stringArguments, identifierArguments };
}

function javaType(overrides: Partial<JavaType> & Pick<JavaType, 'name'>): JavaType {
  return { kind: 'class', annotations: [], methods: [], line: 1, ...overrides };
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
          { name: 'doWork', annotations: [annotation('GetMapping', { value: '/x' })], line: 5 },
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
          { name: 'register', annotations: [annotation('PostMapping')], line: 10 },
          {
            name: 'findById',
            annotations: [annotation('GetMapping', { value: '/{id}' })],
            line: 15,
          },
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
          { name: 'home', annotations: [annotation('GetMapping', { value: '/home' })], line: 3 },
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
          {
            name: 'create',
            annotations: [
              annotation(
                'RequestMapping',
                { value: '/orders' },
                { method: ['RequestMethod.POST'] },
              ),
            ],
            line: 8,
          },
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
          {
            name: 'get',
            annotations: [
              annotation(
                'RequestMapping',
                { path: '/orders/{id}' },
                { method: ['RequestMethod.GET', 'RequestMethod.HEAD'] },
              ),
            ],
            line: 12,
          },
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
          { name: 'any', annotations: [annotation('RequestMapping', { value: '/x' })], line: 4 },
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
          { name: 'ping', annotations: [annotation('GetMapping', { value: '/ping' })], line: 2 },
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
        methods: [{ name: 'listA', annotations: [annotation('GetMapping')], line: 1 }],
      }),
      javaType({
        name: 'B',
        annotations: [annotation('RestController'), annotation('RequestMapping', { value: '/b' })],
        methods: [{ name: 'listB', annotations: [annotation('GetMapping')], line: 1 }],
      }),
    ]);
    const apis = discoverApisInFile(model, 'Multi.java');
    expect(apis.map((a) => `${a.className}:${a.path}`)).toEqual(['A:/a', 'B:/b']);
  });
});
