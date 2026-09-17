import type { JavaAnnotation, JavaSourceFile, JavaType } from '@flowscope/parser-java';
import { HTTP_METHODS, type DiscoveredApi, type HttpMethod } from './api';

/**
 * Interprets one file's Java Semantic Model for REST routing — both
 * Spring MVC (docs/sprints/SPRINT-4.md) and JAX-RS/Jersey
 * (docs/sprints/SPRINT-11.md). Pure and framework-model-in, DTO-out — no
 * filesystem access, so it's trivially testable against hand-built
 * `JavaSourceFile` values as well as real parser output.
 */

const CONTROLLER_ANNOTATION_NAMES = new Set(['RestController', 'Controller']);

const MAPPING_ANNOTATION_HTTP_METHOD: Readonly<Record<string, HttpMethod>> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  PatchMapping: 'PATCH',
  DeleteMapping: 'DELETE',
};

const HTTP_METHOD_SET: ReadonlySet<string> = new Set(HTTP_METHODS);

function isControllerType(type: JavaType): boolean {
  return type.annotations.some((annotation) => CONTROLLER_ANNOTATION_NAMES.has(annotation.name));
}

function findAnnotation(
  annotations: readonly JavaAnnotation[],
  name: string,
): JavaAnnotation | undefined {
  return annotations.find((annotation) => annotation.name === name);
}

/** `value` and `path` are Spring's two accepted aliases for a mapping annotation's URL. */
function annotationPath(annotation: JavaAnnotation): string {
  return annotation.stringArguments.value ?? annotation.stringArguments.path ?? '';
}

function joinPaths(base: string, sub: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedSub = sub.replace(/^\/+/, '');
  const normalizedBase =
    trimmedBase === '' || trimmedBase.startsWith('/') ? trimmedBase : `/${trimmedBase}`;

  if (trimmedSub === '') {
    return normalizedBase === '' ? '/' : normalizedBase;
  }
  return normalizedBase === '' ? `/${trimmedSub}` : `${normalizedBase}/${trimmedSub}`;
}

/**
 * `@RequestMapping(method = RequestMethod.POST)` (or an array of methods)
 * → ["POST"]. No explicit `method` in real Spring matches every HTTP
 * verb — we never fabricate which one, so that case yields an empty
 * array and the caller skips it entirely (MASTER_PLAN.md §12).
 */
function extractRequestMappingMethods(annotation: JavaAnnotation): HttpMethod[] {
  const chains = annotation.identifierArguments.method ?? [];
  const methods: HttpMethod[] = [];
  for (const chain of chains) {
    const segments = chain.split('.');
    const lastSegment = segments[segments.length - 1];
    if (lastSegment !== undefined && HTTP_METHOD_SET.has(lastSegment)) {
      methods.push(lastSegment as HttpMethod);
    }
  }
  return methods;
}

function makeApi(
  httpMethod: HttpMethod,
  path: string,
  className: string,
  methodName: string,
  file: string,
  line: number,
): DiscoveredApi {
  return {
    id: `${httpMethod} ${path}#${file}:${methodName}`,
    httpMethod,
    path,
    className,
    methodName,
    file,
    line,
  };
}

function discoverMethodApis(type: JavaType, basePath: string, file: string): DiscoveredApi[] {
  const apis: DiscoveredApi[] = [];

  for (const method of type.methods) {
    for (const annotation of method.annotations) {
      const shorthandMethod = MAPPING_ANNOTATION_HTTP_METHOD[annotation.name];
      if (shorthandMethod) {
        const fullPath = joinPaths(basePath, annotationPath(annotation));
        apis.push(makeApi(shorthandMethod, fullPath, type.name, method.name, file, method.line));
        continue;
      }

      if (annotation.name === 'RequestMapping') {
        const httpMethods = extractRequestMappingMethods(annotation);
        if (httpMethods.length === 0) {
          continue;
        }
        const fullPath = joinPaths(basePath, annotationPath(annotation));
        for (const httpMethod of httpMethods) {
          apis.push(makeApi(httpMethod, fullPath, type.name, method.name, file, method.line));
        }
      }
    }
  }

  return apis;
}

/**
 * JAX-RS (Jersey, RESTEasy, …) splits what Spring MVC's shorthand mapping
 * annotations combine: `@Path` carries only the URL (class-level base path,
 * optionally suffixed by a method-level `@Path`), and a separate bare
 * marker annotation — `@GET`/`@POST`/`@PUT`/`@PATCH`/`@DELETE` — carries
 * only the HTTP verb, no URL. Those marker names are exactly
 * `HTTP_METHODS`'s own literal values, so the existing `HTTP_METHOD_SET`
 * doubles as the JAX-RS annotation allowlist — no separate table needed
 * (docs/sprints/SPRINT-11.md; no import-namespace check, since ADR-006
 * never resolves imports — `javax.ws.rs.GET` and `jakarta.ws.rs.GET` are
 * indistinguishable here, and don't need to be).
 */
function isJaxRsResourceType(type: JavaType): boolean {
  return type.annotations.some((annotation) => annotation.name === 'Path');
}

/**
 * A JAX-RS resource needs no class-level `@Controller`-equivalent marker —
 * a class-level `@Path` alone is enough to say "this declares endpoints"
 * (mirroring how real Jersey resource classes are written; registration
 * with a `ResourceConfig`/`JerseyConfig` subclass, by explicit
 * `register(...)` or `packages(...)` scanning, isn't verified here, the
 * same scope boundary Spring MVC discovery already accepts — it doesn't
 * verify component-scan boundaries either).
 */
function discoverJaxRsMethodApis(type: JavaType, basePath: string, file: string): DiscoveredApi[] {
  const apis: DiscoveredApi[] = [];

  for (const method of type.methods) {
    const httpMethodAnnotation = method.annotations.find((annotation) =>
      HTTP_METHOD_SET.has(annotation.name),
    );
    if (!httpMethodAnnotation) {
      continue;
    }
    const methodPath = findAnnotation(method.annotations, 'Path');
    const fullPath = joinPaths(basePath, methodPath ? annotationPath(methodPath) : '');
    apis.push(
      makeApi(
        httpMethodAnnotation.name as HttpMethod,
        fullPath,
        type.name,
        method.name,
        file,
        method.line,
      ),
    );
  }

  return apis;
}

/** Discovers every REST endpoint (Spring MVC or JAX-RS/Jersey) declared in one file's Java Semantic Model. */
export function discoverApisInFile(sourceFile: JavaSourceFile, file: string): DiscoveredApi[] {
  const apis: DiscoveredApi[] = [];

  for (const type of sourceFile.types) {
    if (isControllerType(type)) {
      const classMapping = findAnnotation(type.annotations, 'RequestMapping');
      const basePath = classMapping ? annotationPath(classMapping) : '';
      apis.push(...discoverMethodApis(type, basePath, file));
    }
    if (isJaxRsResourceType(type)) {
      const classPath = findAnnotation(type.annotations, 'Path');
      const basePath = classPath ? annotationPath(classPath) : '';
      apis.push(...discoverJaxRsMethodApis(type, basePath, file));
    }
  }

  return apis;
}
