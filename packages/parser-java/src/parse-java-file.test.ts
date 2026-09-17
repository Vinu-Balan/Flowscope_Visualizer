import { describe, expect, it } from 'vitest';
import { parseJavaFile } from './parse-java-file';

describe('parseJavaFile', () => {
  it('extracts the package name', () => {
    const result = parseJavaFile('package com.example.demo;\nclass Foo {}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.packageName).toBe('com.example.demo');
  });

  it('defaults to an empty package name when there is none', () => {
    const result = parseJavaFile('class Foo {}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.packageName).toBe('');
  });

  it('extracts a top-level class with no annotations or methods', () => {
    const result = parseJavaFile('package p;\npublic class Foo {}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types).toEqual([
      {
        name: 'Foo',
        kind: 'class',
        annotations: [],
        methods: [],
        fields: [],
        line: 2,
        implementsTypes: [],
      },
    ]);
  });

  it('extracts a class-level annotation with no arguments', () => {
    const result = parseJavaFile('@RestController\npublic class Foo {}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.annotations).toEqual([
      { name: 'RestController', stringArguments: {}, identifierArguments: {} },
    ]);
  });

  it('extracts a bare single-value annotation as the implicit "value" argument', () => {
    const result = parseJavaFile('@RequestMapping("/customers")\npublic class Foo {}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.annotations).toEqual([
      { name: 'RequestMapping', stringArguments: { value: '/customers' }, identifierArguments: {} },
    ]);
  });

  it('extracts named element-value pairs, mixing string and identifier values', () => {
    const source = `
      class Foo {
        @RequestMapping(value = "/orders", method = RequestMethod.POST)
        public void create() {}
      }
    `;
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.methods[0]?.annotations).toEqual([
      {
        name: 'RequestMapping',
        stringArguments: { value: '/orders' },
        identifierArguments: { method: ['RequestMethod.POST'] },
      },
    ]);
  });

  it('extracts an array of enum-constant references without flattening across items', () => {
    const source = `
      class Foo {
        @RequestMapping(path = "/orders/{id}", method = {RequestMethod.GET, RequestMethod.HEAD})
        public void get() {}
      }
    `;
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const annotation = result.value.types[0]?.methods[0]?.annotations[0];
    expect(annotation?.stringArguments).toEqual({ path: '/orders/{id}' });
    expect(annotation?.identifierArguments).toEqual({
      method: ['RequestMethod.GET', 'RequestMethod.HEAD'],
    });
  });

  it('extracts methods with their own annotations, distinct from the class', () => {
    const source = `
      @RestController
      public class CustomerController {
          @PostMapping
          public void register() {}

          @GetMapping("/{id}")
          public void findById() {}

          public void helper() {}
      }
    `;
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const type = result.value.types[0];
    expect(type?.name).toBe('CustomerController');
    expect(type?.methods.map((m) => m.name)).toEqual(['register', 'findById', 'helper']);
    expect(type?.methods[0]?.annotations.map((a) => a.name)).toEqual(['PostMapping']);
    expect(type?.methods[1]?.annotations[0]?.stringArguments).toEqual({ value: '/{id}' });
    expect(type?.methods[2]?.annotations).toEqual([]);
  });

  it('does not attribute a nested record/class declaration to the enclosing class', () => {
    const source = `
      @RestController
      public class CustomerController {
          @PostMapping
          public void register(RegisterCustomerRequest request) {}

          public record RegisterCustomerRequest(String email, String fullName) {}
      }
    `;
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the outer class is modeled; the nested record is neither
    // reported as its own type nor allowed to pollute the outer class's
    // method list (ADR-006).
    expect(result.value.types.map((t) => t.name)).toEqual(['CustomerController']);
    expect(result.value.types[0]?.methods.map((m) => m.name)).toEqual(['register']);
  });

  it('reports multiple top-level classes independently', () => {
    const source = `
      class A { public void a() {} }
      class B { public void b() {} }
    `;
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types.map((t) => t.name)).toEqual(['A', 'B']);
    expect(result.value.types[0]?.methods.map((m) => m.name)).toEqual(['a']);
    expect(result.value.types[1]?.methods.map((m) => m.name)).toEqual(['b']);
  });

  it('parses generics, lambdas, and modern syntax without error', () => {
    const source = `
      package com.example;
      import java.util.List;
      import java.util.function.Function;

      public interface Repo<T> {
          List<T> findAll();
      }

      class Impl implements Repo<String> {
          public List<String> findAll() {
              Function<String, String> f = x -> x.trim();
              return List.of(f.apply("a"));
          }
      }
    `;
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
  });

  it('returns a ParserError (not a thrown exception) for malformed Java', () => {
    const source = 'package com.example\npublic class Broken { this is not java !!! {{{';
    const result = parseJavaFile(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PARSER_ERROR');
  });

  it('records a plausible source line for the class and each method', () => {
    const source = [
      'package p;',
      '',
      'public class Foo {',
      '',
      '    public void bar() {}',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.line).toBe(3);
    expect(result.value.types[0]?.methods[0]?.line).toBe(5);
  });
});

describe('parseJavaFile — interfaces, implements/extends (docs/sprints/SPRINT-13.md)', () => {
  it('extracts an interface as its own type, kind "interface"', () => {
    const source = [
      'package com.example;',
      '',
      'public interface CommentService {',
      '    Comment createComment(Long postId, String text);',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types).toEqual([
      {
        name: 'CommentService',
        kind: 'interface',
        annotations: [],
        methods: [
          { name: 'createComment', annotations: [], line: 4, parameterCount: 2, bodyEvents: [] },
        ],
        fields: [],
        line: 3,
        implementsTypes: [],
      },
    ]);
  });

  it("records a class's implements list, simple names only", () => {
    const source = [
      'package com.example;',
      '',
      'public class CommentServiceImplementation implements CommentService, Auditable {',
      '    public Comment createComment(Long postId, String text) { return null; }',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.implementsTypes).toEqual(['CommentService', 'Auditable']);
  });

  it("records a class's single extends target", () => {
    const source = [
      'package com.example;',
      '',
      'public class AdminController extends BaseController {',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.extendsType).toBe('BaseController');
  });

  it('records an interface extending multiple other interfaces into implementsTypes', () => {
    const source = [
      'package com.example;',
      '',
      'public interface CommentService extends BaseService, Auditable {',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.implementsTypes).toEqual(['BaseService', 'Auditable']);
  });

  it("extracts a default interface method's real body, not just an empty stub", () => {
    const source = [
      'package com.example;',
      '',
      'public interface CommentService {',
      '    default void audit(String action) {',
      '        auditLog.append(action);',
      '    }',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const method = result.value.types[0]?.methods[0];
    expect(method?.name).toBe('audit');
    expect(method?.bodyEvents).toEqual([
      expect.objectContaining({ kind: 'call', targetName: 'auditLog', methodName: 'append' }),
    ]);
  });

  it('an abstract interface method (no body) still parses with empty bodyEvents, not an error', () => {
    const source = [
      'package com.example;',
      '',
      'public interface CommentService {',
      '    void deleteComment(Long id);',
      '}',
    ].join('\n');
    const result = parseJavaFile(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.methods[0]?.bodyEvents).toEqual([]);
  });
});
