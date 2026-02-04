import { describe, it, expect } from 'vitest';
import { createRoutes, getRouteByName, getAllRoutes } from './index.js';

describe('createRoutes', () => {
  describe('$index (root route)', () => {
    it('accesses root route via $index', () => {
      const routes = createRoutes(['/', '/about']);

      expect(routes.$index.toString()).toBe('/');
    });

    it('throws when calling toString() on routes directly', () => {
      const routes = createRoutes(['/', '/about']);

      expect(() => routes.toString()).toThrow('Cannot call toString() on routes directly');
    });

    it('throws when calling toPattern() on routes directly', () => {
      const routes = createRoutes(['/', '/about']);

      expect(() => routes.toPattern()).toThrow('Cannot call toPattern() on routes directly');
    });

    it('handles query parameters on root route', () => {
      const routes = createRoutes(['/']);

      expect(routes.$index({ page: 1 }).toString()).toBe('/?page=1');
    });

    it('returns correct pattern for root', () => {
      const routes = createRoutes(['/']);

      expect(routes.$index.toPattern()).toBe('/');
    });

    it('handles trailing slash on root', () => {
      const routes = createRoutes(['/'], { trailingSlash: true });

      expect(routes.$index.toString()).toBe('/');
    });
  });

  describe('basic routes', () => {
    it('creates routes from string definitions', () => {
      const routes = createRoutes(['/', '/about', '/contact']);

      expect(routes.$index.toString()).toBe('/');
      expect(routes.about.toString()).toBe('/about');
      expect(routes.contact.toString()).toBe('/contact');
    });

    it('handles nested static routes', () => {
      const routes = createRoutes(['/users/settings/profile']);

      expect(routes.users.settings.profile.toString()).toBe('/users/settings/profile');
    });
  });

  describe('dynamic routes', () => {
    it('handles single parameter', () => {
      const routes = createRoutes(['/users/:userId']);

      expect(routes.users('123').toString()).toBe('/users/123');
      expect(routes.users('abc').toString()).toBe('/users/abc');
    });

    it('handles multiple parameters', () => {
      const routes = createRoutes(['/users/:userId/posts/:postId']);

      expect(routes.users('abc').posts(42).toString()).toBe('/users/abc/posts/42');
    });

    it('handles numeric parameters', () => {
      const routes = createRoutes(['/posts/:postId']);

      expect(routes.posts(123).toString()).toBe('/posts/123');
    });
  });

  describe('query parameters', () => {
    it('handles query parameters', () => {
      const routes = createRoutes(['/search']);

      expect(routes.search({ q: 'hello', page: 1 }).toString()).toBe('/search?q=hello&page=1');
    });

    it('handles query parameters on dynamic routes', () => {
      const routes = createRoutes(['/users/:userId']);

      expect(routes.users('abc', { tab: 'posts' }).toString()).toBe('/users/abc?tab=posts');
    });

    it('handles empty query object', () => {
      const routes = createRoutes(['/search']);

      expect(routes.search({}).toString()).toBe('/search');
    });
  });

  describe('route config', () => {
    it('handles route config with meta', () => {
      const routes = createRoutes([{ path: '/admin', meta: { requiresAuth: true } }]);

      expect(routes.admin.getMeta()).toEqual({ requiresAuth: true });
    });

    it('handles route config with name', () => {
      const routes = createRoutes([{ path: '/users/:userId', name: 'user' }]);

      expect(routes.users('123').toString()).toBe('/users/123');
    });

    it('handles root route with meta via $index', () => {
      const routes = createRoutes([{ path: '/', meta: { isHome: true } }]);

      expect(routes.$index.getMeta()).toEqual({ isHome: true });
    });
  });

  describe('options', () => {
    it('adds trailing slash when enabled', () => {
      const routes = createRoutes(['/about', '/users/:userId'], { trailingSlash: true });

      expect(routes.about.toString()).toBe('/about/');
      expect(routes.users('123').toString()).toBe('/users/123/');
    });
  });

  describe('toPattern', () => {
    it('returns the route pattern', () => {
      const routes = createRoutes(['/users/:userId/posts/:postId']);

      expect(routes.users('abc').posts(42).toPattern()).toBe('/users/:userId/posts/:postId');
    });

    it('returns pattern for static routes', () => {
      const routes = createRoutes(['/about']);

      expect(routes.about.toPattern()).toBe('/about');
    });
  });

  describe('template literal usage', () => {
    it('works in template literals', () => {
      const routes = createRoutes(['/users/:userId']);
      const url = `https://example.com${routes.users('123')}`;

      expect(url).toBe('https://example.com/users/123');
    });

    it('works with $index in template literals', () => {
      const routes = createRoutes(['/']);
      const url = `https://example.com${routes.$index}`;

      expect(url).toBe('https://example.com/');
    });
  });
});

describe('getRouteByName', () => {
  it('returns route by name', () => {
    const routes = createRoutes([{ path: '/users/:userId', name: 'user' }]);

    expect(getRouteByName(routes, 'user', { userId: 'abc' }).toString()).toBe('/users/abc');
  });

  it('handles route without params', () => {
    const routes = createRoutes([{ path: '/about', name: 'about' }]);

    expect(getRouteByName(routes, 'about').toString()).toBe('/about');
  });

  it('handles root route by name', () => {
    const routes = createRoutes([{ path: '/', name: 'home' }]);

    expect(getRouteByName(routes, 'home').toString()).toBe('/');
  });

  it('handles route with multiple params', () => {
    const routes = createRoutes([{ path: '/users/:userId/posts/:postId', name: 'post' }]);

    expect(getRouteByName(routes, 'post', { userId: 'abc', postId: 123 }).toString()).toBe('/users/abc/posts/123');
  });

  it('handles query parameters', () => {
    const routes = createRoutes([
      {
        path: '/search',
        name: 'search',
        query: { q: (v: unknown) => String(v) },
      },
    ]);

    expect(getRouteByName(routes, 'search', undefined, { q: 'hello' }).toString()).toBe('/search?q=hello');
  });

  it('returns correct pattern', () => {
    const routes = createRoutes([{ path: '/users/:userId', name: 'user' }]);

    expect(getRouteByName(routes, 'user', { userId: 'abc' }).toPattern()).toBe('/users/:userId');
  });

  it('returns meta data', () => {
    const routes = createRoutes([{ path: '/admin', name: 'admin', meta: { requiresAuth: true } }]);

    expect(getRouteByName(routes, 'admin').getMeta()).toEqual({ requiresAuth: true });
  });

  it('throws for unknown route name', () => {
    const routes = createRoutes([{ path: '/about', name: 'about' }]);

    // @ts-expect-error - testing runtime behavior with invalid name
    expect(() => getRouteByName(routes, 'unknown')).toThrow('Route "unknown" not found');
  });

  it('respects trailingSlash option', () => {
    const routes = createRoutes([{ path: '/users/:userId', name: 'user' }], { trailingSlash: true });

    expect(getRouteByName(routes, 'user', { userId: 'abc' }).toString()).toBe('/users/abc/');
  });
});

describe('getAllRoutes', () => {
  it('returns all route definitions', () => {
    const routes = createRoutes(['/', '/about', '/users/:userId']);

    const all = getAllRoutes(routes);

    expect(all).toHaveLength(3);
    expect(all[0]).toEqual({ pattern: '/' });
    expect(all[1]).toEqual({ pattern: '/about' });
    expect(all[2]).toEqual({ pattern: '/users/:userId' });
  });

  it('includes name and meta for config routes', () => {
    const routes = createRoutes([{ path: '/admin', name: 'admin', meta: { requiresAuth: true } }]);

    const all = getAllRoutes(routes);

    expect(all[0]).toEqual({
      pattern: '/admin',
      name: 'admin',
      meta: { requiresAuth: true },
    });
  });

  it('returns empty array for empty definitions', () => {
    const routes = createRoutes([]);

    expect(getAllRoutes(routes)).toEqual([]);
  });
});

describe('parsers', () => {
  describe('function parser', () => {
    it('transforms param values', () => {
      const routes = createRoutes([
        {
          path: '/posts/:postId' as const,
          params: { postId: (v: unknown) => Number(v) * 2 },
        },
      ]);

      expect(routes.posts(5).toString()).toBe('/posts/10');
    });

    it('throws on validation failure', () => {
      const routes = createRoutes([
        {
          path: '/posts/:postId' as const,
          params: {
            postId: (v: unknown) => {
              const num = Number(v);
              if (isNaN(num)) throw new Error('Invalid number');
              return num;
            },
          },
        },
      ]);

      expect(() => routes.posts('abc')).toThrow('Invalid number');
    });
  });

  describe('object parser with parse()', () => {
    it('uses .parse() method', () => {
      const mockParser = {
        parse: (v: unknown) => String(v).toUpperCase(),
      };

      const routes = createRoutes([
        {
          path: '/users/:userId' as const,
          params: { userId: mockParser },
        },
      ]);

      expect(routes.users('abc').toString()).toBe('/users/ABC');
    });
  });

  describe('object parser with validateSync()', () => {
    it('uses .validateSync() method', () => {
      const mockValidator = {
        validateSync: (v: unknown) => String(v).toLowerCase(),
      };

      const routes = createRoutes([
        {
          path: '/users/:userId' as const,
          params: { userId: mockValidator },
        },
      ]);

      expect(routes.users('ABC').toString()).toBe('/users/abc');
    });
  });

  describe('object parser with decode()', () => {
    it('uses .decode() method for Right values', () => {
      const mockDecoder = {
        decode: (v: unknown) => ({ _tag: 'Right' as const, right: `decoded-${v}` }),
      };

      const routes = createRoutes([
        {
          path: '/users/:userId' as const,
          params: { userId: mockDecoder },
        },
      ]);

      expect(routes.users('abc').toString()).toBe('/users/decoded-abc');
    });

    it('throws for Left values', () => {
      const mockDecoder = {
        decode: () => ({ _tag: 'Left' as const, left: ['error'] }),
      };

      const routes = createRoutes([
        {
          path: '/users/:userId' as const,
          params: { userId: mockDecoder },
        },
      ]);

      expect(() => routes.users('abc')).toThrow('Decode failed');
    });
  });

  describe('query parser', () => {
    it('validates query parameters', () => {
      const routes = createRoutes([
        {
          path: '/search' as const,
          query: {
            page: (v: unknown) => Number(v),
            q: (v: unknown) => String(v).trim(),
          },
        },
      ]);

      expect(routes.search({ page: '5', q: '  hello  ' }).toString()).toBe('/search?page=5&q=hello');
    });
  });
});

describe('edge cases', () => {
  it('handles deeply nested routes', () => {
    const routes = createRoutes(['/a/b/c/d/e']);

    expect(routes.a.b.c.d.e.toString()).toBe('/a/b/c/d/e');
  });

  it('handles mixed static and dynamic segments', () => {
    const routes = createRoutes(['/users/:userId/posts/:postId/comments']);

    expect(routes.users('u1').posts('p1').comments.toString()).toBe('/users/u1/posts/p1/comments');
  });

  it('returns undefined for non-existent routes', () => {
    const routes = createRoutes(['/about']);

    // @ts-expect-error - testing runtime behavior
    expect(routes.nonexistent).toBeUndefined();
  });

  it('handles hyphenated segments with bracket notation', () => {
    const routes = createRoutes(['/account-settings', '/user-profile/:userId']);

    expect(routes['account-settings'].toString()).toBe('/account-settings');
    expect(routes['user-profile']('123').toString()).toBe('/user-profile/123');
  });
});

describe('strict terminal routes', () => {
  it('throws when calling toString() on intermediate static segment', () => {
    const routes = createRoutes(['/users/:userId/posts/:postId']);

    expect(() => routes.users.toString()).toThrow('"/users" is not a defined route');
  });

  it('throws when calling toString() on intermediate dynamic segment', () => {
    const routes = createRoutes(['/users/:userId/posts/:postId']);

    expect(() => routes.users(123).toString()).toThrow('"/users/:userId" is not a defined route');
  });

  it('throws when calling toPattern() on intermediate segment', () => {
    const routes = createRoutes(['/users/:userId/posts/:postId']);

    expect(() => routes.users(123).toPattern()).toThrow('"/users/:userId" is not a defined route');
  });

  it('allows toString() on terminal route', () => {
    const routes = createRoutes(['/users/:userId/posts/:postId']);

    expect(routes.users(123).posts(456).toString()).toBe('/users/123/posts/456');
  });

  it('throws when $index.toString() is called but "/" is not defined', () => {
    const routes = createRoutes(['/about']);

    expect(() => routes.$index.toString()).toThrow('"/" is not a defined route');
  });

  it('allows $index.toString() when "/" is defined', () => {
    const routes = createRoutes(['/', '/about']);

    expect(routes.$index.toString()).toBe('/');
  });

  it('allows intermediate routes when explicitly defined', () => {
    const routes = createRoutes(['/users', '/users/:userId', '/users/:userId/posts/:postId']);

    expect(routes.users.toString()).toBe('/users');
    expect(routes.users(123).toString()).toBe('/users/123');
    expect(routes.users(123).posts(456).toString()).toBe('/users/123/posts/456');
  });

  it('requires param value when route has dynamic segment (type safety)', () => {
    const routes = createRoutes(['/search/:searchTerm']);

    // Correct usage - param value required
    expect(routes.search('typescript').toString()).toBe('/search/typescript');
    expect(routes.search('typescript', { page: 1 }).toString()).toBe('/search/typescript?page=1');

    // Incorrect usage - passing object where param expected
    // @ts-expect-error - object not assignable to string | number
    routes.search({ q: 'typescript' });
  });

  it('allows both static and dynamic routes at same path', () => {
    const routes = createRoutes(['/search', '/search/:searchTerm']);

    // Static route - query params
    expect(routes.search.toString()).toBe('/search');
    expect(routes.search({ q: 'typescript' }).toString()).toBe('/search?q=typescript');

    // Dynamic route - param value
    expect(routes.search('typescript').toString()).toBe('/search/typescript');
    expect(routes.search('typescript', { page: 1 }).toString()).toBe('/search/typescript?page=1');
  });
});
