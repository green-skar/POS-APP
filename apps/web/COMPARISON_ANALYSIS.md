# Comparison: User Management vs Employee Management Pages

## Summary
Both pages use the **same API endpoint** (`/api/auth/users`), but they have different frontend filtering logic and cache keys. The core issue is that the **API is only returning 2 users** for store admins, even though the database has 9 users linked to store 3.

---

## 1. API Endpoint (Shared by Both Pages)

**Endpoint:** `/api/auth/users` (GET)

**Backend Logic:**
- For `super_admin`: Returns all users where `role != 'super_admin'`
- For `admin` (store admin): Returns users from their `session.storeId` where `role != 'super_admin'`

**Expected Behavior:** Store admins should see all 9 employees in their store (all non-super_admin roles).

**Current Issue:** API is only returning 2 users (cashier and admin) for store admins.

---

## 2. User Management Page (`apps/web/src/app/admin/cashiers/page.jsx`)

### Data Fetching:
```javascript
queryKey: ['users']  // Simple cache key - no user/store ID
queryFn: fetch('/api/auth/users')
```

### Frontend Processing:
1. **No super_admin filtering** - Uses all users from API response
2. **Role filtering only:**
   ```javascript
   const filteredUsers = users.filter(user => {
     if (roleFilter === 'all') return true;
     return user.role === roleFilter;
   });
   ```
3. **Hardcoded role options:**
   ```javascript
   const roleOptions = [
     { value: 'all', label: 'All Roles' },
     ...(isSuperAdmin() ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
     { value: 'admin', label: 'Admin' },
     { value: 'cashier', label: 'Cashier' }
   ];
   ```
   - Only shows: `all`, `super_admin` (if super admin), `admin`, `cashier`
   - **Does NOT dynamically generate options from fetched users**

### Logging:
- Basic: `console.log('Users API response:', data);`
- No debug headers logging
- No detailed user-by-user logging

### Cache Key:
- `['users']` - Simple, shared across all users
- **Potential issue:** Cache collisions between different users

---

## 3. Employee Management Page (`apps/web/src/app/admin/employees/page.jsx`)

### Data Fetching:
```javascript
queryKey: ['employees', authUser?.id, store?.id]  // Includes user and store in cache key
queryFn: fetch('/api/auth/users')
```

### Frontend Processing:
1. **Filters out super_admin:**
   ```javascript
   const employees = (data.users || []).filter(u => u.role !== 'super_admin');
   ```
2. **Role AND status filtering:**
   ```javascript
   const filteredEmployees = employees.filter(emp => {
     const roleMatch = roleFilter === 'all' || emp.role === roleFilter;
     const statusMatch = statusFilter === 'all' 
       ? true 
       : statusFilter === 'active' 
         ? emp.is_active === 1 || emp.is_active === true
         : emp.is_active === 0 || emp.is_active === false;
     return roleMatch && statusMatch;
   });
   ```
3. **Dynamic role options:**
   ```javascript
   const uniqueRoles = [...new Set(employees.map(emp => emp.role))].sort();
   const roleOptions = [
     { value: 'all', label: 'All Roles' },
     ...uniqueRoles.map(role => ({
       value: role,
       label: predefinedRoles.find(r => r.value === role)?.label || role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')
     }))
   ];
   ```
   - **Dynamically generates options from fetched employees**
   - Shows all roles present in the data: `admin`, `cashier`, `manager`, `supervisor`, etc.

### Logging:
- **Extensive logging:**
  - Debug headers from API (`X-Debug-User-Count`, `X-Debug-Store-Id`, `X-Debug-Role`)
  - Total users count
  - Each user's role and active status
  - Filtered employees count
  - Unique roles found

### Cache Key:
- `['employees', authUser?.id, store?.id]` - User and store specific
- **Better:** Avoids cache collisions between different users/stores

---

## 4. Key Differences

| Aspect | User Management | Employee Management |
|--------|----------------|---------------------|
| **Cache Key** | `['users']` | `['employees', authUser?.id, store?.id]` |
| **Super Admin Filter** | ❌ No (shows super_admin if present) | ✅ Yes (filters out super_admin) |
| **Role Options** | 🔒 Hardcoded: `all`, `admin`, `cashier` | 🔄 Dynamic: Generated from fetched data |
| **Status Filter** | ❌ No | ✅ Yes (`active`, `inactive`, `all`) |
| **Logging** | Basic | Extensive with debug headers |
| **API Response** | Uses `data.users` directly | Filters `data.users` to remove super_admin |

---

## 5. The Root Problem

**Both pages are receiving only 2 users from the API**, which means:

1. ✅ **Frontend logic is correct** - Both pages correctly process what they receive
2. ❌ **API is the issue** - The `/api/auth/users` endpoint is only returning 2 users for store admins
3. ✅ **Database is correct** - Direct SQL queries return all 9 users

**Why only 2 users?**
- The API query should return all 9 users (verified with direct SQL)
- The server may not have reloaded with the latest API code
- There might be a caching issue at the API level
- The `session.storeId` might not be correctly passed to the query

---

## 6. Recommendations

### Immediate Fix:
1. **Restart the dev server** to ensure the latest API code is running
2. **Check server terminal logs** for `[API]` prefixed logs to see:
   - What `session.storeId` is being used
   - How many users the query finds
   - What the final result count is

### Long-term Improvements:

1. **Standardize User Management Page:**
   - Update cache key to include user/store ID: `['users', authUser?.id, store?.id]`
   - Add debug header logging
   - Consider filtering out super_admin (or make it configurable)
   - Add status filtering if needed

2. **Unify Role Options:**
   - Both pages should dynamically generate role options from fetched data
   - This ensures consistency and shows all available roles

3. **Add API Response Validation:**
   - Both pages should log the API response count
   - Add warnings if the count doesn't match expectations

4. **Cache Strategy:**
   - Use consistent cache key patterns across both pages
   - Include user/store context to avoid collisions

---

## 7. Next Steps

1. **Verify API is running latest code:**
   - Check server terminal for `[API] ===== GET /api/auth/users called =====` logs
   - If not present, server hasn't reloaded

2. **Check API logs:**
   - Look for `[API] Session role:`, `[API] Store ID:`, `[API] Users linked to store`
   - These will show what the API is actually querying

3. **Compare with database:**
   - The direct SQL query returns 9 users
   - The API should return the same 9 users
   - If it doesn't, there's a server-side issue

4. **Fix the API:**
   - Once we identify why only 2 users are returned, fix the query or session handling
   - Both pages will then automatically show all 9 users















