import type { Parser, ParserMap } from './types.js';

/**
 * Run a parser (handles function, .parse(), .validateSync(), and .decode())
 */
export function runParser<I, O>(parser: Parser<I, O>, value: I): O {
  // Function style
  if (typeof parser === 'function') {
    return parser(value);
  }
  // Zod/Valibot/ArkType style: { parse: (value) => T }
  if ('parse' in parser && typeof parser.parse === 'function') {
    return parser.parse(value);
  }
  // Yup style: { validateSync: (value) => T }
  if ('validateSync' in parser && typeof parser.validateSync === 'function') {
    return parser.validateSync(value);
  }
  // io-ts style: { decode: (value) => Either<Errors, T> }
  if ('decode' in parser && typeof parser.decode === 'function') {
    const result = parser.decode(value);
    if (result._tag === 'Right') {
      return result.right as O;
    }
    throw new Error(`Decode failed: ${JSON.stringify(result.left)}`);
  }
  throw new Error('Invalid parser: must be a function or have .parse(), .validateSync(), or .decode() method');
}

/**
 * Create a combined parser from a ParserMap
 */
export function createObjectParser(parserMap: ParserMap): Parser<Record<string, unknown>, Record<string, unknown>> {
  return {
    parse: (obj: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [key, parser] of Object.entries(parserMap)) {
        if (key in obj) {
          result[key] = runParser(parser, obj[key]);
        }
      }
      return result;
    },
  };
}
