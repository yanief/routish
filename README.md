# routish

**Type-safe routes, no strings attached.**

A tiny, fully type-safe route builder for TypeScript. Define your routes once, get autocomplete everywhere, and never typo a URL again.

## Features

- 🎯 **Fully type-safe** — path params, query params, everything
- 🔍 **Autocomplete** — your IDE knows all your routes
- 🛡️ **Runtime validation** — optional Zod schemas for params
- 📦 **Zero dependencies** — only Zod as optional peer dep
- 🪶 **Tiny** — ~2KB minified
- 🔌 **Framework agnostic** — works with React Router, Vue Router, or vanilla JS

## Installation

```bash
npm install routish
```

Routish has **zero dependencies**. Bring your own validation library (Zod, Valibot, ArkType) or use simple functions.

## Quick Start

```typescript
import { createRoutes } from 'routish';
import { z } from 'zod';

const routes = createRoutes([
  '/',
  '/about',
  '/users/:userId',
  { 
    path: '/users/:userId/posts/:postId',
    params: { 
      userId: z.string().uuid(),
      postId: z.coerce.number(),
    },
    query: { 
      edit: z.enum(['true', 'false']).optional(),
    },
  },
]);

// Generate URLs with full type safety
routes.about.toString()                    // "/about"
routes.users('abc-123').toString()         // "/users/abc-123"
routes.users('abc').posts(42).toString()   // "/users/abc/posts/42"
routes.users('abc').posts(42, { edit: 'true' }).toString()  
// "/users/abc/posts/42?edit=true"

// Works in template literals
const url = `https://example.com${routes.users('123')}`;
```

## API

### `createRoutes(definitions, options?)`

Creates a type-safe route tree.

#### Route Definitions

Routes can be defined as simple strings or config objects:

```typescript
const routes = createRoutes([
  // Simple string routes
  '/about',
  '/contact',
  
  // Routes with config
  {
    path: '/users/:userId',
    params: { userId: z.string().uuid() },    // Validate path params
    query: { tab: z.enum(['posts', 'likes']) }, // Validate query params
    name: 'user',                              // Named route
    meta: { requiresAuth: true },              // Custom metadata
  },
]);
```

#### Options

```typescript
const routes = createRoutes([...], {
  trailingSlash: true,  // Add trailing slashes to all URLs
});
```

### Route Node Methods

Every route node has these methods:

| Method | Description |
|--------|-------------|
| `toString()` | Returns the URL string |
| `toPattern()` | Returns the pattern (e.g., `/users/:userId`) |
| `meta` | Access route metadata |

### Named Routes

Access routes by name using `byName`:

```typescript
const routes = createRoutes([
  { path: '/users/:userId/posts/:postId', name: 'post' },
]);

routes.byName.post({ userId: 'abc', postId: 123 }).toString()
// "/users/abc/posts/123"
```

### All Routes

Get all route definitions for router registration:

```typescript
routes.all.forEach(route => {
  console.log(route.pattern, route.name, route.meta);
});
```

## Framework Integration

### React Router

```tsx
import { createBrowserRouter, Link } from 'react-router-dom';

// Register routes
const router = createBrowserRouter(
  routes.all.map(route => ({
    path: route.pattern,
    element: <Page />,
  }))
);

// Type-safe links
<Link to={`${routes.users(userId)}`}>Profile</Link>

// Type-safe navigation
const navigate = useNavigate();
navigate(`${routes.users(userId).posts({ page: 1 })}`);
```

### Vue Router

```typescript
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: routes.all.map(route => ({
    path: route.pattern,
    name: route.name,
    meta: route.meta,
    component: () => import(`./pages/${route.name}.vue`),
  })),
});

// Navigation
router.push(`${routes.users(userId)}`);
```

```vue
<router-link :to="`${routes.users(userId)}`">Profile</router-link>
```

### Vanilla JavaScript

```typescript
// Fetch API
const res = await fetch(`/api${routes.users(userId)}`);

// Window location
window.location.href = `${routes.posts({ page: 2 })}`;

// History API  
history.pushState(null, '', `${routes.users(userId)}`);
```

## Validation

Routish is **validation-library agnostic**. Use Zod, Valibot, ArkType, or plain functions.

### With Zod

```typescript
import { z } from 'zod';

const routes = createRoutes([
  {
    path: '/users/:userId',
    params: { userId: z.string().uuid() },
    query: { page: z.coerce.number().optional() },
  },
]);

routes.users('valid-uuid').toString()  // ✓ Works
routes.users('not-a-uuid')              // ✗ Throws ZodError
```

### With Valibot

```typescript
import * as v from 'valibot';

const routes = createRoutes([
  {
    path: '/users/:userId',
    params: { userId: v.parser(v.pipe(v.string(), v.uuid())) },
    query: { page: v.parser(v.optional(v.pipe(v.string(), v.transform(Number)))) },
  },
]);
```

### With Yup

```typescript
import * as yup from 'yup';

const routes = createRoutes([
  {
    path: '/users/:userId',
    params: { userId: yup.string().uuid().required() },
    query: { page: yup.number().positive() },
  },
]);

routes.users('valid-uuid').toString()  // ✓ Works
routes.users(123)                       // ✗ Throws ValidationError
```

### With io-ts

```typescript
import * as t from 'io-ts';

const routes = createRoutes([
  {
    path: '/users/:userId',
    params: { userId: t.string },
    query: { page: t.number },
  },
]);

// io-ts decode() returns Either - routish handles this automatically
routes.users('abc').toString()  // ✓ Works
```

### With Custom Functions

```typescript
const routes = createRoutes([
  {
    path: '/posts/:postId',
    params: { 
      postId: (v) => {
        const num = parseInt(v, 10);
        if (isNaN(num)) throw new Error('Invalid postId');
        return num;
      }
    },
  },
]);

routes.posts(123).toString()    // ✓ "/posts/123"
routes.posts('abc')             // ✗ Throws Error
```

### Parser Interface

Routish accepts any parser that matches one of these signatures:

```typescript
// Function style
type Parser = (value: unknown) => T;

// Object style with .parse() (Zod, Valibot, ArkType)
type Parser = { parse: (value: unknown) => T };

// Object style with .validateSync() (Yup)
type Parser = { validateSync: (value: unknown) => T };

// Object style with .decode() (io-ts)
type Parser = { decode: (value: unknown) => Either<Errors, T> };
```

**Type safety for param names:**

```typescript
// ✗ Type error — 'wrongName' doesn't exist in path
{
  path: '/users/:userId',
  params: { wrongName: z.string() },
}
```

## TypeScript

Routish provides full type inference:

```typescript
// Path params are typed based on Zod schema
routes.posts(123)        // ✓ number accepted (z.coerce.number)
routes.posts('abc')      // ✗ Type error if schema expects number

// Query params are fully typed
routes.users({ page: 1, sort: 'asc' })   // ✓
routes.users({ invalid: true })           // ✗ Type error

// Autocomplete works everywhere
routes.users.  // IDE shows: posts, settings, ...
```

## License

MIT