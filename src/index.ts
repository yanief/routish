/**
 * routish
 * Type-safe routes, no strings attached.
 *
 * @example
 * ```ts
 * import { createRoutes } from 'routish';
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
 *   { path: '/users/:userId', params: { userId: z.string().uuid() } },
 * ]);
 *
 * // With Valibot
 * import * as v from 'valibot';
 * const routes = createRoutes([
 *   { path: '/users/:userId', params: { userId: v.parser(v.pipe(v.string(), v.uuid())) } },
 * ]);
 *
 * // With custom parser
 * const routes = createRoutes([
 *   { path: '/posts/:postId', params: { postId: (v) => parseInt(v, 10) } },
 * ]);
 * ```
 */

import { runParser, createObjectParser } from './parser.js';
import type {
  Meta,
  NamedRoute,
  Parser,
  ParserMap,
  QueryParams,
  RouteConfig,
  RouteDefinition,
  RouteInfo,
  RouteNode,
  RouteTree,
  RoutishOptions,
  Segment,
  TreeNode,
  ValidateDefinitions,
} from './types.js';

// ============================================
// Public API
// ============================================

export { createRoutes };
export type { RouteNode, RouteDefinition, RouteConfig, RouteInfo, RoutishOptions, Parser, ParserMap };

// ============================================
// Main Implementation
// ============================================

function createRoutes<const T extends readonly RouteDefinition[]>(
  definitions: T & ValidateDefinitions<T>,
  options: RoutishOptions = {}
): RouteTree<T> {
  const tree = buildTree([...definitions] as RouteDefinition[]);
  const namedRoutes = buildNamedRoutes([...definitions] as RouteDefinition[], options);
  const allRoutes = buildAllRoutes([...definitions] as RouteDefinition[]);

  const proxy = createProxy([], undefined, tree, options, null);

  Object.defineProperty(proxy, 'byName', { value: createNamedRoutesProxy(namedRoutes), enumerable: false });
  Object.defineProperty(proxy, 'all', { value: allRoutes, enumerable: false });

  return proxy as RouteTree<T>;
}

// ============================================
// Tree Building
// ============================================

function buildTree(definitions: RouteDefinition[]): TreeNode {
  const root: TreeNode = { children: {}, paramName: null, paramParser: null, queryParser: null, meta: null };

  for (const def of definitions) {
    const config = typeof def === 'string' ? { path: def } : def;
    let node = root;

    for (const seg of config.path.split('/').filter(Boolean)) {
      const isParam = seg.startsWith(':');
      const key = isParam ? '$param' : seg;
      const paramName = isParam ? seg.slice(1) : null;

      node = node.children[key] ??= { children: {}, paramName, paramParser: null, queryParser: null, meta: null };

      if (isParam && config.params?.[paramName!]) {
        node.paramParser = config.params[paramName!] as Parser;
      }
    }

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

function createNamedRoutesProxy(namedRoutes: Map<string, NamedRoute>): unknown {
  return new Proxy(
    {},
    {
      get: (_, name: string) => {
        const route = namedRoutes.get(name);
        if (!route) return undefined;

        return (paramsOrQuery?: Record<string, unknown>, maybeQuery?: QueryParams) => {
          const hasParams = route.paramNames.length > 0;
          let params: Record<string, unknown> = {};
          let query: QueryParams | undefined;

          if (hasParams) {
            params = paramsOrQuery ?? {};
            query = maybeQuery;
          } else {
            query = paramsOrQuery as QueryParams | undefined;
          }

          if (route.paramParser) params = runParser(route.paramParser, params) as Record<string, unknown>;
          if (query && route.queryParser) query = runParser(route.queryParser, query) as QueryParams;

          let path = route.pattern;
          for (const p of route.paramNames) path = path.replace(`:${p}`, String(params[p]));

          if (route.options.trailingSlash && !path.endsWith('/')) path += '/';

          if (query && Object.keys(query).length > 0) {
            path += '?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
          }

          return { __segments: [], __query: query, meta: route.meta, toString: () => path, toPattern: () => route.pattern };
        };
      },
    }
  );
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
      if (prop === 'meta') return meta ?? tree.meta;
      if (prop === 'toString' || prop === Symbol.toStringTag) return () => buildPath(segments, query, trailingSlash);
      if (prop === 'toPattern') return () => buildPattern(segments, trailingSlash);
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      const child = tree.children[prop] ?? paramNode?.children[prop];
      return child ? createProxy([...segments, { type: 'static', name: prop }], undefined, child, options, child.meta) : undefined;
    },
  });
}
