# JSON-Based API Protocol Standard

All frontend-backend communication MUST use JSON-based protocols exclusively. URL parameters are PROHIBITED for data operations.

## Protocol Requirements

### Backend API Design
- **POST, PUT, PATCH, DELETE** for data manipulation
- **GET** only for simple resource retrieval (no query parameters)
- **ALL request data** in JSON format in request body
- **ALL response data** in JSON format

### URL Parameter Restrictions

```typescript
// ❌ PROHIBITED
GET /api/users?page=1&limit=10&published=true
GET /api/products?category=electronics&sort=price

// ✅ REQUIRED
POST /api/users/list    // with JSON body
POST /api/products/search  // with JSON body
```

## Backend Implementation

### Route Definition Pattern

```typescript
// ❌ WRONG - URL parameters
router.get('/users', (req, res) => {
  const { page, limit, published } = req.query;
});

// ✅ CORRECT - JSON body
router.post('/users/list', validate(listUsersSchema), (req, res) => {
  const { page, limit, filters } = req.body;
});
```

Note: Backend routes are mounted under `/api` prefix in `app.ts`, so route handlers use paths without `/api`.
```

### Zod Schema Pattern

```typescript
// Schema validates { body, query, params } from request
export const listUsersSchema = z.object({
  body: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(10),
    filters: z.object({
      published: z.boolean().optional(),
      category: z.string().optional(),
    }).optional(),
    sort: z.object({
      field: z.string(),
      direction: z.enum(['asc', 'desc'])
    }).optional(),
  }),
});

// For routes with URL params like /users/:id
export const getUserSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
```

### Complete Route Handler Example

```typescript
router.post('/users/list', validate(listUsersSchema), async (req, res) => {
  const { page, limit, filters, sort } = req.body;
  
  const skip = (page - 1) * limit;
  
  // Use TCB CloudBase JS SDK on frontend for database operations
  // Example: const { data } = await db.collection('users').where(filters).skip(skip).limit(limit).get()
  
  res.json({ users: [], pagination: { page, limit, total: 0 } });
});
```

## Frontend Implementation (Taro)

### API Call Pattern

```typescript
import Taro from '@tarojs/taro';

// ❌ WRONG - URL parameters
const response = await Taro.request({
  url: `${BASE_URL}/users?page=1&limit=10&published=true`,
  method: 'GET'
});

// ✅ CORRECT - JSON body
const response = await Taro.request({
  url: `${BASE_URL}/users/list`,
  method: 'POST',
  header: { 'Content-Type': 'application/json' },
  data: {
    page: 1,
    limit: 10,
    filters: { published: true }
  }
});
```

### Using API Client

```typescript
import { apiClient } from '@/services/api-client';

// List with pagination and filters (use full /api path)
const { data } = await apiClient.post('/api/users/list', {
  page: 1,
  limit: 10,
  filters: { published: true }
});

// Search with complex criteria
const { data } = await apiClient.post('/api/products/search', {
  query: 'phone',
  category: 'electronics',
  priceRange: { min: 100, max: 1000 }
});
```

## Route Design Patterns

### Resource Operations

```typescript
router.post('/users/list', ...);      // List with pagination/filters
router.post('/users/search', ...);    // Complex search operations
router.post('/users', ...);           // Create new user
router.put('/users/:id', ...);        // Full update
router.patch('/users/:id', ...);      // Partial update
router.delete('/users/:id', ...);     // Delete user

// Simple GET operations (no parameters)
router.get('/users/:id', ...);        // Get single user by ID
router.get('/users/count', ...);      // Get user count
```

## Benefits

- **Type Safety**: Full TypeScript validation with Zod schemas
- **Consistency**: Uniform request/response format
- **Security**: No URL encoding issues or injection vulnerabilities
- **Flexibility**: Complex nested structures easily supported
- **Debugging**: Complete request/response visibility in logs
