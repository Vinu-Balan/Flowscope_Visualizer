import type { JavaAnnotation, JavaSourceFile, JavaType } from '@flowscope/parser-java';
import { HTTP_METHODS, type DiscoveredApi, type HttpMethod } from './api';

/**
 * Interprets one file's Java Semantic Model for Spring MVC routing
 * (docs/sprints/SPRINT-4.md). Pure and framework-model-in, DTO-out — no
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

/** Discovers every Spring MVC endpoint declared in one file's Java Semantic Model. */
export function discoverApisInFile(sourceFile: JavaSourceFile, file: string): DiscoveredApi[] {
  const apis: DiscoveredApi[] = [];

  for (const type of sourceFile.types) {
    if (!isControllerType(type)) {
      continue;
    }
    const classMapping = findAnnotation(type.annotations, 'RequestMapping');
    const basePath = classMapping ? annotationPath(classMapping) : '';
    apis.push(...discoverMethodApis(type, basePath, file));
  }

  return apis;
}
