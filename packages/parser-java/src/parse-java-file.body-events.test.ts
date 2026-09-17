import { describe, expect, it } from 'vitest';
import { parseJavaFile } from './parse-java-file';
import type { JavaBodyEvent } from './java-model';

function bodyEventsOf(source: string, methodName = 'm'): readonly JavaBodyEvent[] {
  const result = parseJavaFile(source);
  expect(result.ok).toBe(true);
  if (!result.ok) return [];
  const method = result.value.types[0]?.methods.find((candidate) => candidate.name === methodName);
  return method?.bodyEvents ?? [];
}

describe('parseJavaFile — field declarations', () => {
  it('extracts a field name and its simple declared type', () => {
    const result = parseJavaFile('class Foo { private final CustomerService customerService; }');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.fields).toEqual([
      { name: 'customerService', type: 'CustomerService' },
    ]);
  });

  it('extracts a field of a generic type by its simple raw type name, ignoring type arguments', () => {
    const result = parseJavaFile(
      'class Foo { private final Map<String, Customer> customersById = new HashMap<>(); }',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.fields).toEqual([{ name: 'customersById', type: 'Map' }]);
  });

  it('extracts multiple fields independently', () => {
    const result = parseJavaFile('class Foo { private String a; private int b; }');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.types[0]?.fields).toEqual([
      { name: 'a', type: 'String' },
      { name: 'b', type: 'int' },
    ]);
  });
});

describe('parseJavaFile — method body events', () => {
  it('extracts a bare method call statement', () => {
    const events = bodyEventsOf('class Foo { void m() { existsByEmail(email); } }');
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: '', methodName: 'existsByEmail', argumentCount: 1, argumentsText: 'email' },
    ]);
  });

  it('extracts a call with a dotted target from a local variable declaration', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { Customer c = customerService.findById(id); } }',
    );
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: 'customerService', methodName: 'findById', argumentCount: 1, argumentsText: 'id' },
    ]);
  });

  it('extracts a bare statement call with a dotted target', () => {
    const events = bodyEventsOf('class Foo { void m() { customersById.put(id, customer); } }');
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: 'customersById', methodName: 'put', argumentCount: 2, argumentsText: 'id, customer' },
    ]);
  });

  it('extracts object construction and flags an identifier-generation argument', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { Customer c = new Customer(UUID.randomUUID().toString(), email, name); } }',
    );
    expect(events).toEqual([
      {
        kind: 'construct',
        line: 1,
        methodName: 'Customer',
        looksGenerated: true,
        argumentsText: 'UUID.randomUUID().toString(), email, name',
      },
    ]);
  });

  it('does not flag construction with ordinary arguments as identifier-generated', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { Customer c = new Customer(email, name); } }',
    );
    expect(events).toEqual([
      { kind: 'construct', line: 1, methodName: 'Customer', looksGenerated: false, argumentsText: 'email, name' },
    ]);
  });

  it('extracts an if-guard whose then-branch throws, plus the throw itself', () => {
    const source = `
      class Foo {
        void m() {
          if (existsByEmail(email)) {
            throw new IllegalStateException("dup");
          }
        }
      }
    `;
    const events = bodyEventsOf(source);
    expect(events).toEqual([
      {
        kind: 'if',
        line: 4,
        conditionText: 'existsByEmail(email)',
        guardThrows: true,
        guardReturns: false,
        hasConditionCall: true,
        thenEventCount: 1,
      },
      { kind: 'call', line: 4, targetName: '', methodName: 'existsByEmail', argumentCount: 1, argumentsText: 'email' },
      {
        kind: 'throw',
        line: 5,
        exceptionType: 'IllegalStateException',
        exceptionMessage: 'dup',
        argumentsText: '"dup"',
      },
    ]);
  });

  it('extracts an if-guard whose then-branch returns, with a fallback text condition for a non-call comparison', () => {
    const source = `
      class Foo {
        void m() {
          if (customer == null) {
            return null;
          }
        }
      }
    `;
    const events = bodyEventsOf(source);
    expect(events).toEqual([
      {
        kind: 'if',
        line: 4,
        conditionText: 'customer == null',
        guardThrows: false,
        guardReturns: true,
        hasConditionCall: false,
        thenEventCount: 1,
      },
      { kind: 'return', line: 5, returnsNullLiteral: true },
    ]);
  });

  it('extracts a return statement that returns a call chain result', () => {
    const events = bodyEventsOf('class Foo { void m() { return ResponseEntity.ok(customer); } }');
    expect(events).toEqual([
      {
        kind: 'return',
        line: 1,
        returnsCallTarget: 'ResponseEntity',
        returnsCallMethod: 'ok',
        returnsCallArgumentsText: 'customer',
      },
    ]);
  });

  it('extracts a bare return of a local variable with no call involved', () => {
    const events = bodyEventsOf('class Foo { void m() { return customer; } }');
    expect(events).toEqual([{ kind: 'return', line: 1, returnsIdentifier: 'customer' }]);
  });

  it('does not extract a call used only as an argument to another call', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { customerService.register(request.email(), request.fullName()); } }',
    );
    expect(events).toEqual([
      {
        kind: 'call',
        line: 1,
        targetName: 'customerService',
        methodName: 'register',
        argumentCount: 2,
        argumentsText: 'request.email(), request.fullName()',
      },
    ]);
  });

  it('produces an empty list for a method with no body-worthy statements', () => {
    const events = bodyEventsOf('class Foo { void m() { int x = 1; } }');
    expect(events).toEqual([]);
  });
});

describe('parseJavaFile — this.field.method(...) calls (docs/sprints/SPRINT-7.md)', () => {
  it('extracts an explicitly this-qualified field call, not just a bare fqnOrRefType one', () => {
    const events = bodyEventsOf('class Foo { void m() { this.categoryService.addCategory(name); } }');
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: 'categoryService', methodName: 'addCategory', argumentCount: 1, argumentsText: 'name' },
    ]);
  });

  it('extracts a this-qualified call with no intervening field (a self-call)', () => {
    const events = bodyEventsOf('class Foo { void m() { this.doSomething(); } }');
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: '', methodName: 'doSomething', argumentCount: 0, argumentsText: '' },
    ]);
  });

  it('still resolves the first call in a chain after a this-qualified target', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { this.repository.findById(id).orElseThrow(); } }',
    );
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: 'repository', methodName: 'findById', argumentCount: 1, argumentsText: 'id' },
    ]);
  });
});

describe('parseJavaFile — builder-pattern construction (docs/sprints/SPRINT-7.md)', () => {
  it('recognizes X.builder()...build() as constructing an X, not a call to "builder"', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { User user = User.builder().name(n).email(e).build(); } }',
    );
    expect(events).toEqual([{ kind: 'construct', line: 1, methodName: 'User', looksGenerated: false }]);
  });

  it('does not misfire for an unrelated *.builder() call with no trailing build()', () => {
    const events = bodyEventsOf('class Foo { void m() { StringBuilder sb = text.builder(); } }');
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: 'text', methodName: 'builder', argumentCount: 0, argumentsText: '' },
    ]);
  });
});

describe('parseJavaFile — string-literal arguments and returns (docs/sprints/SPRINT-7.md)', () => {
  it('captures a bare string-literal first argument on a call', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { model.addAttribute("username", username); } }',
    );
    expect(events).toEqual([
      {
        kind: 'call',
        line: 1,
        targetName: 'model',
        methodName: 'addAttribute',
        argumentCount: 2,
        firstStringArgument: 'username',
        argumentsText: '"username", username',
      },
    ]);
  });

  it('does not capture a non-literal first argument', () => {
    const events = bodyEventsOf('class Foo { void m() { model.addAttribute(key, value); } }');
    expect(events).toEqual([
      {
        kind: 'call',
        line: 1,
        targetName: 'model',
        methodName: 'addAttribute',
        argumentCount: 2,
        argumentsText: 'key, value',
      },
    ]);
  });

  it('captures a bare string-literal return value', () => {
    const events = bodyEventsOf('class Foo { void m() { return "redirect:categories"; } }');
    expect(events).toEqual([{ kind: 'return', line: 1, returnsStringLiteral: 'redirect:categories' }]);
  });

  it('captures the leading literal of a return-value string concatenation', () => {
    const events = bodyEventsOf('class Foo { void m() { return "prefix-" + id; } }');
    expect(events).toEqual([{ kind: 'return', line: 1, returnsStringLiteral: 'prefix-' }]);
  });

  it('does not treat a plain call return as a string literal', () => {
    const events = bodyEventsOf('class Foo { void m() { return ResponseEntity.ok(x); } }');
    expect(events).toEqual([
      {
        kind: 'return',
        line: 1,
        returnsCallTarget: 'ResponseEntity',
        returnsCallMethod: 'ok',
        returnsCallArgumentsText: 'x',
      },
    ]);
  });

  it('captures the leading literal of a throw message built by concatenation', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { throw new IllegalStateException("Email already exists: " + email); } }',
    );
    expect(events).toEqual([
      {
        kind: 'throw',
        line: 1,
        exceptionType: 'IllegalStateException',
        exceptionMessage: 'Email already exists: ',
        argumentsText: '"Email already exists: " + email',
      },
    ]);
  });
});

describe('parseJavaFile — plain assignment (not a declaration) (docs/sprints/SPRINT-12.md)', () => {
  it('extracts the call on the right-hand side of `x = call();`, not the assignment target', () => {
    // `x = repo.find(id);` reassigns an already-declared variable — the
    // grammar shape looks almost identical to a plain call statement, but
    // the assignment target was previously misread as "the" primary,
    // silently discarding the real call on the right entirely.
    const events = bodyEventsOf('class Foo { void m() { user = repo.find(id); } }');
    expect(events).toEqual([
      { kind: 'call', line: 1, targetName: 'repo', methodName: 'find', argumentCount: 1, argumentsText: 'id' },
    ]);
  });

  it('extracts a construct assigned to an already-declared variable the same way', () => {
    const events = bodyEventsOf('class Foo { void m() { user = new User(email); } }');
    expect(events).toEqual([
      { kind: 'construct', line: 1, methodName: 'User', looksGenerated: false, argumentsText: 'email' },
    ]);
  });
});

describe('parseJavaFile — try/catch (docs/sprints/SPRINT-12.md)', () => {
  it('bounds the try-block and a single catch clause by event count', () => {
    const source = `
      class Foo {
        void m() {
          try {
            validate(user);
            userDao.save(user);
          } catch (DataIntegrityViolationException e) {
            throw new IllegalStateException("dup");
          }
        }
      }
    `;
    const events = bodyEventsOf(source);
    expect(events).toEqual([
      { kind: 'try', line: 4, tryEventCount: 2, catchCount: 1 },
      { kind: 'call', line: 5, targetName: '', methodName: 'validate', argumentCount: 1, argumentsText: 'user' },
      {
        kind: 'call',
        line: 6,
        targetName: 'userDao',
        methodName: 'save',
        argumentCount: 1,
        argumentsText: 'user',
      },
      { kind: 'catch', line: 7, exceptionType: 'DataIntegrityViolationException', catchEventCount: 1 },
      {
        kind: 'throw',
        line: 8,
        exceptionType: 'IllegalStateException',
        exceptionMessage: 'dup',
        argumentsText: '"dup"',
      },
    ]);
  });

  it('bounds multiple catch clauses independently, and code after the whole try/catch is not absorbed into the last catch', () => {
    const source = `
      class Foo {
        void m() {
          try {
            risky();
          } catch (IOException e) {
            logError(e);
          } catch (RuntimeException e) {
            logOther(e);
          }
          afterTry();
        }
      }
    `;
    const events = bodyEventsOf(source);
    expect(events.map((event) => event.kind)).toEqual([
      'try',
      'call', // risky()
      'catch',
      'call', // logError(e)
      'catch',
      'call', // logOther(e)
      'call', // afterTry()
    ]);
    expect(events[0]).toMatchObject({ tryEventCount: 1, catchCount: 2 });
    expect(events[2]).toMatchObject({ exceptionType: 'IOException', catchEventCount: 1 });
    expect(events[4]).toMatchObject({ exceptionType: 'RuntimeException', catchEventCount: 1 });
    expect(events[6]).toMatchObject({ methodName: 'afterTry' });
  });

  it('handles try-with-resources the same way, ignoring the resource declaration itself', () => {
    const source = `
      class Foo {
        void m() {
          try (AutoCloseable a = open()) {
            use(a);
          } catch (Exception e) {
            handle(e);
          }
        }
      }
    `;
    const events = bodyEventsOf(source);
    expect(events.map((event) => event.kind)).toEqual(['try', 'call', 'catch', 'call']);
    expect(events[1]).toMatchObject({ methodName: 'use' });
  });

  it('handles a try with no catch clause at all (try-with-resources used purely for auto-closing)', () => {
    const events = bodyEventsOf(
      'class Foo { void m() { try (AutoCloseable a = open()) { use(a); } } }',
    );
    expect(events).toEqual([
      { kind: 'try', line: 1, tryEventCount: 1, catchCount: 0 },
      { kind: 'call', line: 1, targetName: '', methodName: 'use', argumentCount: 1, argumentsText: 'a' },
    ]);
  });
});
