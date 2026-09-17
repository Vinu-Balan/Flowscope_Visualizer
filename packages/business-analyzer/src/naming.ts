/**
 * A small, data-driven verb/prefix naming heuristic
 * (MASTER_PLAN.md §12–13) — turns a Java method name and a domain noun
 * into a business-meaningful name/description/type/confidence. Never
 * silently drops a call: anything matching no pattern still produces a
 * step, at low confidence, via `describeCall`'s fallback. See
 * docs/sprints/SPRINT-5.md's "Planned scope".
 */

import type { BegNodeType } from '@flowscope/graph-schema';

export interface CallDescription {
  readonly type: BegNodeType;
  readonly businessName: string;
  readonly businessDescription: string;
  readonly confidence: number;
}

export interface DecisionDescription extends CallDescription {
  /**
   * Which branch answers "Yes" to the phrased question. A raw Java guard
   * condition being true doesn't always mean "yes" to the *phrased*
   * question — `customer == null` being true means "no" to "was the
   * customer found?". `'guard'` means the guard-clause branch (the one
   * that fires when the raw condition is true) is the "Yes" answer;
   * `'continue'` means the branch that resumes normal flow (raw condition
   * false) is the "Yes" answer, and the guard branch is "No". This is
   * what keeps a flowchart's Yes/No edge labels honest rather than just
   * mirroring raw Java truth values (docs/sprints/SPRINT-6.md).
   */
  readonly affirmativeBranch: 'guard' | 'continue';
}

function capitalize(word: string): string {
  return word.length > 0 ? (word[0]?.toUpperCase() ?? '') + word.slice(1) : word;
}

/** Strips common Spring bean suffixes so "CustomerService" reads as "Customer". */
export function domainNounFromType(typeName: string): string {
  const stripped = typeName.replace(/(Service|Repository|Controller|Impl|Manager|Client)$/u, '');
  return stripped.length > 0 ? stripped : typeName;
}

function singularize(word: string): string {
  return word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/** Derives a fallback domain noun from an API path when no owning type is available, e.g. "/customers/{id}" → "Customer". */
export function domainNounFromPath(path: string): string {
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0 && !segment.startsWith('{'));
  const last = segments[segments.length - 1] ?? 'Resource';
  return capitalize(singularize(last));
}

/** camelCase/snake_case identifier → "Title Case Words" — the honest, non-domain-aware fallback (MASTER_PLAN.md §12: never a *substitute* for real inference, only a last resort). */
export function humanizeIdentifier(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/_/gu, ' ');
  return spaced
    .split(' ')
    .filter((word) => word.length > 0)
    .map(capitalize)
    .join(' ');
}

interface PatternRule {
  readonly regex: RegExp;
  readonly build: (
    methodName: string,
    match: RegExpMatchArray,
    noun: string,
    firstStringArgument: string | undefined,
  ) => CallDescription;
}

const RULES: readonly PatternRule[] = [
  {
    regex: /^findBy([A-Z]\w*)$/u,
    build: (_methodName, match, noun) => {
      const suffix = humanizeIdentifier(match[1] ?? '');
      return {
        type: 'business-step',
        businessName: `Find ${noun} by ${suffix}`,
        businessDescription: `Looks up ${noun.toLowerCase()} by ${suffix.toLowerCase()}.`,
        confidence: 0.8,
      };
    },
  },
  {
    regex: /^(?:find|get)(All)?$/u,
    build: (_methodName, match, noun) => {
      const all = Boolean(match[1]);
      return {
        type: 'business-step',
        businessName: all ? `Find All ${noun}s` : `Find ${noun}`,
        businessDescription: all
          ? `Looks up every ${noun.toLowerCase()}.`
          : `Looks up ${noun.toLowerCase()}.`,
        confidence: 0.8,
      };
    },
  },
  {
    regex: /^existsBy([A-Z]\w*)$/u,
    build: (_methodName, match, noun) => {
      const suffix = humanizeIdentifier(match[1] ?? '');
      return {
        type: 'decision',
        businessName: `Check if ${noun} Exists by ${suffix}`,
        businessDescription: `Checks whether a ${noun.toLowerCase()} with that ${suffix.toLowerCase()} already exists.`,
        confidence: 0.75,
      };
    },
  },
  {
    regex: /^(?:exists|has[A-Z]\w*|is[A-Z]\w*)$/u,
    build: (methodName, _match, noun) => ({
      type: 'decision',
      businessName: `Check ${noun} Status`,
      businessDescription: `Evaluates \`${methodName}\`.`,
      confidence: 0.6,
    }),
  },
  {
    regex: /^(?:save|persist|store|put)$/u,
    build: (_methodName, _match, noun) => ({
      type: 'database-operation',
      businessName: `Save ${noun}`,
      businessDescription: `Persists the ${noun.toLowerCase()}.`,
      confidence: 0.75,
    }),
  },
  {
    // Spring MVC's `Model`/`ModelAndView` population — extremely common in
    // classic (non-REST) controllers, and previously the single biggest
    // source of "every node has the same text" (docs/sprints/SPRINT-7.md):
    // every call looked identical without the attribute name.
    regex: /^add(?:Flash)?Attribute$|^addObject$/u,
    build: (_methodName, _match, noun, firstStringArgument) => ({
      type: 'transformation',
      businessName: firstStringArgument
        ? `Prepare "${firstStringArgument}" for Display`
        : `Prepare ${noun} Data for Display`,
      businessDescription: firstStringArgument
        ? `Adds "${firstStringArgument}" to the data shown to the user.`
        : 'Adds data to the response shown to the user.',
      confidence: firstStringArgument ? 0.7 : 0.45,
    }),
  },
  {
    regex: /^set([A-Z]\w*)$/u,
    build: (_methodName, match, noun) => {
      const property = humanizeIdentifier(match[1] ?? '');
      return {
        type: 'transformation',
        businessName: `Set ${property}`,
        businessDescription: `Sets the ${noun.toLowerCase()}'s ${property.toLowerCase()}.`,
        confidence: 0.65,
      };
    },
  },
  {
    regex: /^(register|create|add)$/u,
    build: (methodName, _match, noun) => ({
      type: 'business-step',
      businessName: `${capitalize(methodName)} ${noun}`,
      businessDescription: `${capitalize(methodName)}s a new ${noun.toLowerCase()}.`,
      confidence: 0.85,
    }),
  },
  {
    regex: /^update$/u,
    build: (_methodName, _match, noun) => ({
      type: 'business-step',
      businessName: `Update ${noun}`,
      businessDescription: `Updates the ${noun.toLowerCase()}.`,
      confidence: 0.8,
    }),
  },
  {
    regex: /^(delete|remove)$/u,
    build: (methodName, _match, noun) => ({
      type: 'business-step',
      businessName: `${capitalize(methodName)} ${noun}`,
      businessDescription: `${capitalize(methodName)}s the ${noun.toLowerCase()}.`,
      confidence: 0.8,
    }),
  },
  {
    regex: /^(?:validate|check|verify)$/u,
    build: (methodName, _match, noun) => ({
      type: 'validation',
      businessName: `Validate ${noun}`,
      businessDescription: `Runs \`${methodName}\` on the ${noun.toLowerCase()}.`,
      confidence: 0.8,
    }),
  },
  {
    regex: /^(?:send|notify|publish)[A-Za-z]*$/u,
    build: (methodName) => ({
      type: 'external-service',
      businessName: humanizeIdentifier(methodName),
      businessDescription: `Calls an external service (\`${methodName}\`).`,
      confidence: 0.7,
    }),
  },
];

/**
 * Describes a single method call/statement — the main entry point every
 * other `describe*` helper in this module builds on. `firstStringArgument`
 * (the call's leading string-literal argument, if any — see
 * `packages/parser-java`'s `JavaBodyEvent.firstStringArgument`) both feeds
 * dedicated rules (`addAttribute`) and, for any method matching no
 * pattern, gets folded into the fallback name — two different calls to
 * the same unrecognized method no longer render as identical text
 * (docs/sprints/SPRINT-7.md).
 */
export function describeCall(
  methodName: string,
  noun: string,
  firstStringArgument?: string,
): CallDescription {
  for (const rule of RULES) {
    const match = methodName.match(rule.regex);
    if (match) {
      return rule.build(methodName, match, noun, firstStringArgument);
    }
  }
  const humanized = humanizeIdentifier(methodName) || methodName;
  return {
    type: 'business-step',
    businessName: firstStringArgument ? `${humanized} "${firstStringArgument}"` : humanized,
    businessDescription: firstStringArgument
      ? `Calls \`${methodName}("${firstStringArgument}", ...)\` — no naming pattern recognized this method, so this is a direct translation, not a business inference.`
      : `Calls \`${methodName}\` — no naming pattern recognized this method, so this is a direct translation, not a business inference.`,
    confidence: 0.35,
  };
}

const ERROR_RESPONSE_PATTERN =
  /notfound|badrequest|forbidden|unauthorized|conflict|unprocessable|error/iu;
const SUCCESS_RESPONSE_PATTERN = /^ok$|^created$|^accepted$|^nocontent$/iu;

/** Describes a method's terminal `return` — how the request ultimately gets answered. */
export function describeReturn(
  _callTarget: string | undefined,
  callMethod: string | undefined,
): CallDescription {
  if (callMethod && ERROR_RESPONSE_PATTERN.test(callMethod)) {
    return {
      type: 'error',
      businessName: `Return ${humanizeIdentifier(callMethod)} Response`,
      businessDescription: `Responds with an error (\`${callMethod}\`).`,
      confidence: 0.85,
    };
  }
  if (callMethod && SUCCESS_RESPONSE_PATTERN.test(callMethod)) {
    return {
      type: 'response',
      businessName: 'Return Response',
      businessDescription: 'Responds with the result.',
      confidence: 0.9,
    };
  }
  return {
    type: 'response',
    businessName: 'Return Response',
    businessDescription: 'Responds to the request.',
    confidence: 0.5,
  };
}

export function describeThrow(exceptionType: string, noun: string, message?: string): CallDescription {
  return {
    type: 'error',
    businessName: `Reject ${noun}`,
    businessDescription: message
      ? `Throws \`${exceptionType}\`: "${message.trim()}"`
      : `Throws \`${exceptionType}\`.`,
    confidence: message ? 0.65 : 0.6,
  };
}

/**
 * Describes entering a `catch` clause — the exception-handling counterpart
 * to `describeThrow`. Named after the exception type directly rather than
 * the domain noun: unlike a validation rejection (`describeThrow`'s
 * "Reject Customer"), what's caught here was thrown by whatever the `try`
 * block called — often unrelated to the enclosing method's own domain
 * entity (a `JdService` method catching `IOException` from a PDF library,
 * say) — so the exception type itself is the only honest signal
 * (docs/sprints/SPRINT-12.md).
 */
export function describeCatch(exceptionType: string): CallDescription {
  return {
    type: 'error',
    businessName: `Handle ${exceptionType}`,
    businessDescription: `Catches \`${exceptionType}\` and handles it instead of letting it propagate.`,
    confidence: 0.65,
  };
}

const REDIRECT_VIEW_PREFIX = 'redirect:';
const FORWARD_VIEW_PREFIX = 'forward:';

/** Turns a view path/name into a readable phrase — "customer/list" or "customer-list" → "Customer List". */
function humanizeViewPath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/gu, '');
  const words = trimmed.split(/[/\-_]+/u).filter((word) => word.length > 0);
  return words.length > 0 ? words.map(capitalize).join(' ') : trimmed;
}

/**
 * Describes a controller method's `return "someView";` — classic Spring
 * MVC's other common terminal step, alongside a `ResponseEntity`/DTO
 * return `describeReturn` already handles. Distinguishes redirects,
 * forwards, and plain view renders so different return statements in the
 * same controller don't all collapse into identical text
 * (docs/sprints/SPRINT-7.md).
 */
export function describeViewReturn(viewName: string): CallDescription {
  if (viewName.startsWith(REDIRECT_VIEW_PREFIX)) {
    const target = viewName.slice(REDIRECT_VIEW_PREFIX.length);
    return {
      type: 'response',
      businessName: `Redirect to ${humanizeViewPath(target)}`,
      businessDescription: `Redirects the browser to "${target}".`,
      confidence: 0.75,
    };
  }
  if (viewName.startsWith(FORWARD_VIEW_PREFIX)) {
    const target = viewName.slice(FORWARD_VIEW_PREFIX.length);
    return {
      type: 'response',
      businessName: `Forward to ${humanizeViewPath(target)}`,
      businessDescription: `Forwards the request to "${target}".`,
      confidence: 0.7,
    };
  }
  return {
    type: 'response',
    businessName: `Show ${humanizeViewPath(viewName)} Page`,
    businessDescription: `Renders the "${viewName}" view.`,
    confidence: 0.7,
  };
}

export function describeConstruct(typeName: string, looksGenerated: boolean): CallDescription {
  return looksGenerated
    ? {
        type: 'transformation',
        businessName: `Generate ${typeName}`,
        businessDescription: `Creates a new ${typeName.toLowerCase()} with a generated identifier.`,
        confidence: 0.7,
      }
    : {
        type: 'transformation',
        businessName: `Create ${typeName}`,
        businessDescription: `Creates a new ${typeName.toLowerCase()}.`,
        confidence: 0.6,
      };
}

/** Describes an `if` guard — reframed as a question/check, reusing `describeCall` for its wording when the condition is itself a recognizable call. */
export function describeDecision(
  conditionText: string,
  conditionCall: { readonly targetName: string; readonly methodName: string } | undefined,
  noun: string,
): DecisionDescription {
  if (conditionCall) {
    const base = describeCall(conditionCall.methodName, noun);
    return {
      type: 'decision',
      businessName: /^check/iu.test(base.businessName)
        ? base.businessName
        : `Check: ${base.businessName}`,
      businessDescription: base.businessDescription,
      confidence: base.confidence,
      affirmativeBranch: 'guard',
    };
  }
  if (/==\s*null/u.test(conditionText)) {
    return {
      type: 'decision',
      businessName: `Check if ${noun} was Found`,
      businessDescription: `Checks whether a matching ${noun.toLowerCase()} exists.`,
      confidence: 0.75,
      // The guard fires when the raw check (`== null`) is true, i.e. NOT
      // found — the "No" answer to "was it found?", not "Yes".
      affirmativeBranch: 'continue',
    };
  }
  if (/!=\s*null/u.test(conditionText)) {
    return {
      type: 'decision',
      businessName: `Check if ${noun} Exists`,
      businessDescription: `Checks whether a ${noun.toLowerCase()} is present.`,
      confidence: 0.7,
      affirmativeBranch: 'guard',
    };
  }
  return {
    type: 'decision',
    businessName: 'Check Condition',
    businessDescription: conditionText
      ? `Evaluates \`${conditionText}\`.`
      : 'Evaluates a condition.',
    confidence: 0.4,
    affirmativeBranch: 'guard',
  };
}
