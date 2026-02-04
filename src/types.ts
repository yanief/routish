/**
 * Parser Types (Validation-library agnostic)
 *
 * A parser can be:
 * - A function: (value) => parsedValue
 * - An object with parse method: { parse: (value) => parsedValue } (Zod, Valibot, ArkType)
 * - An object with validateSync method: { validateSync: (value) => parsedValue } (Yup)
 * - An object with decode method: { decode: (value) => Either<Errors, T> } (io-ts)
 */
export type ParserFunction<I, O> = (value: I) => O;
export type ParserObject<I, O> = { parse: (value: I) => O };
export type ValidatorObject<I, O> = { validateSync: (value: I) => O };
export type DecoderObject<I, O> = {
  decode: (value: I) => { _tag: 'Right'; right: O } | { _tag: 'Left'; left: unknown };
};

export type Parser<I = unknown, O = unknown> =
  | ParserFunction<I, O>
  | ParserObject<I, O>
  | ValidatorObject<I, O>
  | DecoderObject<I, O>;

export type ParserMap = Record<string, Parser<any, any>>;

/** Extract output type from a Parser */
export type ParserOutput<T> = T extends Parser<any, infer O> ? O : never;

/** Extract input type from a Parser */
export type ParserInput<T> = T extends Parser<infer I, any> ? I : unknown;

// ============================================
// Input Types
// ============================================

export type Meta = Record<string, unknown>;
export type QueryParams = Record<string, unknown>;

export type RoutishOptions = {
  trailingSlash?: boolean;
};

export type RouteConfig<
  TPath extends string = string,
  TParams extends ParserMap | undefined = ParserMap | undefined,
  TQuery extends ParserMap | undefined = ParserMap | undefined,
  TMeta extends Meta | undefined = Meta | undefined,
  TName extends string | undefined = string | undefined,
> = {
  path: TPath;
  query?: TQuery;
  params?: TParams;
  name?: TName;
  meta?: TMeta;
};

export type RouteDefinition = string | RouteConfig;

// ============================================
// Validation Types
// ============================================

export type ExtractParamNames<S extends string> = S extends `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractParamNames<`/${Rest}`>
  : S extends `${string}:${infer Param}`
    ? Param
    : never;

type StrictRouteConfig<Path extends string> = {
  path: Path;
  query?: ParserMap;
  name?: string;
  meta?: Meta;
} & (ExtractParamNames<Path> extends never
  ? { params?: never }
  : { params?: { [K in ExtractParamNames<Path>]?: Parser } });

type ValidateDefinition<T> = T extends string
  ? T
  : T extends { path: infer P extends string }
    ? StrictRouteConfig<P>
    : never;

export type ValidateDefinitions<T extends readonly unknown[]> = {
  [K in keyof T]: ValidateDefinition<T[K]>;
};

// ============================================
// Output Types
// ============================================

export interface RouteInfo {
  pattern: string;
  name?: string;
  meta?: Meta;
}

export type Segment = { type: 'static'; name: string } | { type: 'param'; name: string; value?: string };

export interface RouteNode {
  readonly __segments: Segment[];
  readonly __query?: QueryParams;
  getMeta(): Meta | null | undefined;
  toString(): string;
  toPattern(): string;
}

/** Symbol used to store route metadata internally */
export const ROUTE_METADATA = Symbol('routish.metadata');

/** Internal metadata stored on the routes object */
export interface RouteMetadata<T extends readonly RouteDefinition[] = readonly RouteDefinition[]> {
  definitions: T;
  namedRoutes: Map<string, NamedRoute>;
  allRoutes: RouteInfo[];
}

export type RouteTree<T extends readonly RouteDefinition[]> = WrapNode<BuildTreeFromArray<T>> & {
  /** Access the root/index route (/) */
  $index: RouteNode & ((query?: QueryParams) => RouteNode);
  [ROUTE_METADATA]: RouteMetadata<T>;
};

// ============================================
// Utility Function Types
// ============================================

/** Extract all route names from definitions */
export type ExtractNames<T extends readonly RouteDefinition[]> = ExtractName<T[number]>;

/** Get the named route config by name */
type GetNamedConfig<T extends readonly RouteDefinition[], N extends string> = Extract<T[number], { name: N }>;

/** Parameters for getRouteByName */
export type GetRouteByNameParams<T extends readonly RouteDefinition[], N extends string> = SafeExtractParamNames<
  GetNamedConfig<T, N>
> extends never
  ? undefined | void
  : NamedRouteParams<GetNamedConfig<T, N>>;

/** Query for getRouteByName */
export type GetRouteByNameQuery<T extends readonly RouteDefinition[], N extends string> = ExtractQuery<
  GetNamedConfig<T, N>
> extends ParserMap
  ? InferParserMap<ExtractQuery<GetNamedConfig<T, N>>>
  : undefined;

// ============================================
// Internal Tree Building Types
// ============================================

type ExtractPath<T> = T extends string ? T : T extends { path: infer P } ? P : never;
type ExtractQuery<T> = T extends { query: infer Q extends ParserMap } ? Q : null;
type ExtractParams<T> = T extends { params: infer P extends ParserMap } ? P : null;
type ExtractMeta<T> = T extends { meta: infer M extends Meta } ? M : null;
type ExtractName<T> = T extends { name: infer N extends string } ? N : never;

type BuildTreeFromArray<T extends readonly RouteDefinition[]> = UnionToIntersection<
  { [K in keyof T]: ParseRoute<ExtractPath<T[K]>, ExtractQuery<T[K]>, ExtractParams<T[K]>, ExtractMeta<T[K]>> }[number]
>;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type ParseRoute<S, Query, Params, M> = S extends `/${infer R}` ? ParseSegments<R, Query, Params, M> : never;

type ParseSegments<S extends string, Query, Params, M> = S extends `${infer Seg}/${infer Rest}`
  ? Seg extends `:${infer ParamName}`
    ? { $call: ParseSegments<Rest, Query, Params, M>; $paramType: GetParamType<Params, ParamName> }
    : { [K in Seg]: ParseSegments<Rest, Query, Params, M> }
  : S extends `:${infer ParamName}`
    ? { $call: { $schema: Query; $meta: M }; $paramType: GetParamType<Params, ParamName> }
    : S extends ''
      ? { $schema: Query; $meta: M }
      : { [K in S]: { $schema: Query; $meta: M } };

type GetParamType<Params, ParamName extends string> = Params extends ParserMap
  ? ParamName extends keyof Params
    ? Params[ParamName]
    : null
  : null;

// ============================================
// Named Routes Types
// ============================================

type SafeExtractParamNames<T> = ExtractPath<T> extends string ? ExtractParamNames<ExtractPath<T>> : never;

type ParamValue = string | number;

export type NamedRouteParams<T> = {
  [K in SafeExtractParamNames<T>]: ExtractParams<T> extends ParserMap
    ? K extends keyof ExtractParams<T>
      ? ParserInput<ExtractParams<T>[K]>
      : ParamValue
    : ParamValue;
};

type InferParserMap<T> = T extends ParserMap ? { [K in keyof T]: ParserOutput<T[K]> } : never;

// ============================================
// Wrap Node Types
// ============================================

type InferQuery<S> = S extends ParserMap ? { [K in keyof S]: ParserOutput<S[K]> } : QueryParams;
type InferParamInput<T> = T extends Parser<infer I, any> ? I : ParamValue;

type Callable<C, Schema, ParamType> = {
  (value: InferParamInput<ParamType>, query?: InferQuery<Schema>): WrapNode<C>;
};

type ExtractSchema<T> = T extends { $schema: infer S } ? S : null;
type ExtractParamType<T> = T extends { $paramType: infer P } ? P : null;

type WrapNode<T> = RouteNode & {
  [K in keyof T as K extends '$call' | '$schema' | '$meta' | '$paramType' ? never : K]: WrapNode<T[K]>;
} & (T extends { $call: infer C }
  ? Callable<DeepMerge<C, Omit<T, '$call' | '$schema' | '$meta' | '$paramType'>>, ExtractSchema<C>, ExtractParamType<T>>
    // If node is also terminal (has $schema), allow query-only calls for the static route
    & (T extends { $schema: unknown } ? { (query?: InferQuery<ExtractSchema<T>>): RouteNode } : {})
  : (query?: InferQuery<ExtractSchema<T>>) => RouteNode);

type DeepMerge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A & keyof B
    ? DeepMerge<A[K], B[K]>
    : K extends keyof A
      ? A[K]
      : K extends keyof B
        ? B[K]
        : never;
};

// ============================================
// Internal Implementation Types
// ============================================

export interface TreeNode {
  children: Record<string, TreeNode>;
  paramName: string | null;
  paramParser: Parser<any, any> | null;
  queryParser: Parser<any, any> | null;
  meta: Meta | null;
  isTerminal: boolean;
}

export interface NamedRoute {
  pattern: string;
  paramNames: string[];
  paramParser: Parser<any, any> | null;
  queryParser: Parser<any, any> | null;
  meta: Meta | null;
  options: RoutishOptions;
}
