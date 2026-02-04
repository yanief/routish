/**
 * routish
 * Type-safe routes, no strings attached.
 *
 * @example
 * ```ts
 * import { createRoutes, getRouteByName, getAllRoutes } from 'routish';
 *
 * // Without validation
 * const routes = createRoutes([
 *   '/',
 *   '/users/:userId',
 * ]);
 *
 * // With Zod
 * import { z } from 'zod';
 * const routes = createRoutes([
 *   { path: '/users/:userId', params: { userId: z.string().uuid() }, name: 'user' },
 * ]);
 *
 * // Named route access
 * getRouteByName(routes, 'user', { userId: 'abc-123' }).toString();
 *
 * // Get all route definitions
 * getAllRoutes(routes);
 * ```
 */

import { runParser, createObjectParser } from './parser.js';
import {
  ROUTE_METADATA,
  type ExtractNames,
  type GetRouteByNameParams,
  type GetRouteByNameQuery,
  type Meta,
  type NamedRoute,
  type Parser,
  type ParserMap,
  type QueryParams,
  type RouteConfig,
  type RouteDefinition,
  type RouteInfo,
  type RouteNode,
  type RouteTree,
  type RoutishOptions,
  type Segment,
  type TreeNode,
  type ValidateDefinitions,
} from './types.js';

// ============================================
// Public API
// ============================================

export { createRoutes, getRouteByName, getAllRoutes };
export type { RouteNode, RouteDefinition, RouteConfig, RouteInfo, RoutishOptions, Parser, ParserMap };

// ============================================
// Main Implementation
// ============================================

function createRoutes<const T extends readonly RouteDefinition[]>(
  definitions: T & ValidateDefinitions<T>,
  options: RoutishOptions = {}
): RouteTree<T> {
  const defArray = [...definitions] as RouteDefinition[];
  const tree = buildTree(defArray);
  const namedRoutes = buildNamedRoutes(defArray, options);
  const allRoutes = buildAllRoutes(defArray);

  const proxy = createRootProxy(tree, options);

  // Store metadata using Symbol for access by utility functions
  Object.defineProperty(proxy, ROUTE_METADATA, {
    value: { definitions, namedRoutes, allRoutes },
    enumerable: false,
    writable: false,
  });

  return proxy as RouteTree<T>;
}

// ============================================
// Standalone Utility Functions
// ============================================

/**
 * Get a route by its name with type-safe parameters
 */
function getRouteByName<T extends readonly RouteDefinition[], N extends ExtractNames<T>>(
  routes: RouteTree<T>,
  name: N,
  params?: GetRouteByNameParams<T, N>,
  query?: GetRouteByNameQuery<T, N>
): RouteNode {
  const metadata = routes[ROUTE_METADATA];
  const route = metadata.namedRoutes.get(name as string);

  if (!route) {
    throw new Error(`Route "${name}" not found`);
  }

  let resolvedParams: Record<string, unknown> = (params as Record<string, unknown>) ?? {};
  let resolvedQuery: QueryParams | undefined = query as QueryParams | undefined;

  if (route.paramParser) {
    resolvedParams = runParser(route.paramParser, resolvedParams) as Record<string, unknown>;
  }
  if (resolvedQuery && route.queryParser) {
    resolvedQuery = runParser(route.queryParser, resolvedQuery) as QueryParams;
  }

  let path = route.pattern;
  for (const p of route.paramNames) {
    path = path.replace(`:${p}`, String(resolvedParams[p]));
  }

  if (route.options.trailingSlash && !path.endsWith('/')) {
    path += '/';
  }

  if (resolvedQuery && Object.keys(resolvedQuery).length > 0) {
    path += '?' + new URLSearchParams(Object.entries(resolvedQuery).map(([k, v]) => [k, String(v)])).toString();
  }

  return {
    __segments: [],
    __query: resolvedQuery,
    getMeta: () => route.meta ?? undefined,
    toString: () => path,
    toPattern: () => route.pattern,
  };
}

/**
 * Get all route definitions
 */
function getAllRoutes<T extends readonly RouteDefinition[]>(routes: RouteTree<T>): RouteInfo[] {
  return routes[ROUTE_METADATA].allRoutes;
}

// ============================================
// Tree Building
// ============================================

function buildTree(definitions: RouteDefinition[]): TreeNode {
  const root: TreeNode = { children: {}, paramName: null, paramParser: null, queryParser: null, meta: null, isTerminal: false };

  for (const def of definitions) {
    const config = typeof def === 'string' ? { path: def } : def;
    let node = root;

    const segments = config.path.split('/').filter(Boolean);

    // Handle root route "/"
    if (segments.length === 0) {
      root.isTerminal = true;
      if (config.query) root.queryParser = createObjectParser(config.query);
      if (config.meta) root.meta = config.meta;
      continue;
    }

    for (const seg of segments) {
      const isParam = seg.startsWith(':');
      const key = isParam ? '$param' : seg;
      const paramName = isParam ? seg.slice(1) : null;

      node = node.children[key] ??= { children: {}, paramName, paramParser: null, queryParser: null, meta: null, isTerminal: false };

      if (isParam && config.params?.[paramName!]) {
        node.paramParser = config.params[paramName!] as Parser;
      }
    }

    // Mark the final node as terminal
    node.isTerminal = true;
    if (config.query) node.queryParser = createObjectParser(config.query);
    if (config.meta) node.meta = config.meta;
  }
  return root;
}

function buildNamedRoutes(definitions: RouteDefinition[], options: RoutishOptions): Map<string, NamedRoute> {
  const named = new Map<string, NamedRoute>();

  for (const def of definitions) {
    if (typeof def === 'string' || !def.name) continue;

    const paramNames: string[] = [];
    const paramParsers: ParserMap = {};

    for (const seg of def.path.split('/').filter(Boolean)) {
      if (seg.startsWith(':')) {
        const name = seg.slice(1);
        paramNames.push(name);
        if (def.params?.[name]) paramParsers[name] = def.params[name];
      }
    }

    named.set(def.name, {
      pattern: def.path,
      paramNames,
      paramParser: Object.keys(paramParsers).length > 0 ? createObjectParser(paramParsers) : null,
      queryParser: def.query ? createObjectParser(def.query) : null,
      meta: def.meta ?? null,
      options,
    });
  }

  return named;
}

function buildAllRoutes(definitions: RouteDefinition[]): RouteInfo[] {
  return definitions.map((def) =>
    typeof def === 'string' ? { pattern: def } : { pattern: def.path, name: def.name, meta: def.meta }
  );
}

// ============================================
// Proxy Creation
// ============================================

function createRootProxy(tree: TreeNode, options: RoutishOptions): unknown {
  const trailingSlash = options.trailingSlash ?? false;
  const paramNode = tree.children['$param'];

  // Create the $index route node (represents "/")
  const createIndexNode = (query?: QueryParams): unknown => {
    const validated = query && tree.queryParser ? runParser(tree.queryParser, query) : query;
    return createRouteNode([], validated as QueryParams, tree.meta, trailingSlash);
  };

  const fn = (valueOrQuery?: string | number | QueryParams, maybeQuery?: QueryParams) => {
    if (typeof valueOrQuery === 'object') {
      return createIndexNode(valueOrQuery);
    }
    if (paramNode && (typeof valueOrQuery === 'string' || typeof valueOrQuery === 'number')) {
      let value: string | number = valueOrQuery;
      if (paramNode.paramParser) value = runParser(paramNode.paramParser, valueOrQuery) as string | number;
      const newSegments = [{ type: 'param' as const, name: paramNode.paramName!, value: String(value) }];
      const validated = maybeQuery && paramNode.queryParser ? runParser(paramNode.queryParser, maybeQuery) : maybeQuery;
      return createProxy(newSegments, validated as QueryParams, paramNode, options, paramNode.meta);
    }
    throw new Error('Invalid arguments');
  };

  return new Proxy(fn, {
    get: (_, prop: string | symbol) => {
      if (prop === '$index') {
        // Return the index route node with callable for query params
        const indexFn = (query?: QueryParams) => createIndexNode(query);
        return new Proxy(indexFn, {
          get: (_, indexProp: string | symbol) => {
            if (indexProp === '__segments') return [];
            if (indexProp === '__query') return undefined;
            if (indexProp === 'getMeta') return () => tree.meta ?? undefined;
            if (indexProp === 'toString' || indexProp === Symbol.toStringTag) {
              return () => {
                if (!tree.isTerminal) {
                  throw new Error('"/" is not a defined route. Define it explicitly: createRoutes([\'/\', ...])');
                }
                return buildPath([], undefined, trailingSlash);
              };
            }
            if (indexProp === 'toPattern') {
              return () => {
                if (!tree.isTerminal) {
                  throw new Error('"/" is not a defined route. Define it explicitly: createRoutes([\'/\', ...])');
                }
                return '/';
              };
            }
            if (indexProp === 'then') return undefined;
            return undefined;
          },
        });
      }
      if (prop === '__segments') return [];
      if (prop === '__query') return undefined;
      if (prop === 'getMeta') return () => tree.meta ?? undefined;
      if (prop === 'toString' || prop === Symbol.toStringTag) {
        return () => {
          throw new Error('Cannot call toString() on routes directly. Use routes.$index for the root route.');
        };
      }
      if (prop === 'toPattern') {
        return () => {
          throw new Error('Cannot call toPattern() on routes directly. Use routes.$index for the root route.');
        };
      }
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      const child = tree.children[prop] ?? paramNode?.children[prop];
      return child ? createProxy([{ type: 'static', name: prop }], undefined, child, options, child.meta) : undefined;
    },
  });
}

function createRouteNode(
  segments: Segment[],
  query: QueryParams | undefined,
  meta: Meta | null,
  trailingSlash: boolean
): unknown {
  return {
    __segments: segments,
    __query: query,
    getMeta: () => meta ?? undefined,
    toString: () => buildPath(segments, query, trailingSlash),
    toPattern: () => buildPattern(segments, trailingSlash),
  };
}

function buildPath(segments: Segment[], query: QueryParams | undefined, trailingSlash: boolean): string {
  const path = '/' + segments.map((s) => (s.type === 'static' ? s.name : s.value)).join('/') + (trailingSlash ? '/' : '');
  if (!query || Object.keys(query).length === 0) return path;
  return path + '?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
}

function buildPattern(segments: Segment[], trailingSlash: boolean): string {
  return '/' + segments.map((s) => (s.type === 'static' ? s.name : `:${s.name}`)).join('/') + (trailingSlash ? '/' : '');
}

function createProxy(
  segments: Segment[],
  query: QueryParams | undefined,
  tree: TreeNode,
  options: RoutishOptions,
  meta: Meta | null
): unknown {
  const paramNode = tree.children['$param'];
  const trailingSlash = options.trailingSlash ?? false;

  const fn = (valueOrQuery?: string | number | QueryParams, maybeQuery?: QueryParams) => {
    if (typeof valueOrQuery === 'object') {
      const validated = tree.queryParser ? runParser(tree.queryParser, valueOrQuery) : valueOrQuery;
      return createProxy(segments, validated as QueryParams, tree, options, tree.meta);
    }
    if (paramNode && (typeof valueOrQuery === 'string' || typeof valueOrQuery === 'number')) {
      let value: string | number = valueOrQuery;
      if (paramNode.paramParser) value = runParser(paramNode.paramParser, valueOrQuery) as string | number;
      const newSegments = [...segments, { type: 'param' as const, name: paramNode.paramName!, value: String(value) }];
      const validated = maybeQuery && paramNode.queryParser ? runParser(paramNode.queryParser, maybeQuery) : maybeQuery;
      return createProxy(newSegments, validated as QueryParams, paramNode, options, paramNode.meta);
    }
    throw new Error('Invalid arguments');
  };

  return new Proxy(fn, {
    get: (_, prop: string | symbol) => {
      if (prop === '__segments') return segments;
      if (prop === '__query') return query;
      if (prop === 'getMeta') return () => (meta ?? tree.meta) ?? undefined;
      if (prop === 'toString' || prop === Symbol.toStringTag) {
        return () => {
          if (!tree.isTerminal) {
            const pattern = buildPattern(segments, false);
            throw new Error(`"${pattern}" is not a defined route. Did you forget to add it to createRoutes()?`);
          }
          return buildPath(segments, query, trailingSlash);
        };
      }
      if (prop === 'toPattern') {
        return () => {
          if (!tree.isTerminal) {
            const pattern = buildPattern(segments, false);
            throw new Error(`"${pattern}" is not a defined route. Did you forget to add it to createRoutes()?`);
          }
          return buildPattern(segments, trailingSlash);
        };
      }
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      const child = tree.children[prop] ?? paramNode?.children[prop];
      return child ? createProxy([...segments, { type: 'static', name: prop }], undefined, child, options, child.meta) : undefined;
    },
  });
}
