# Login Requirements

## User Roles

### 1. Super Admin
- **Username**: `superadmin`
- **Password**: `admin123`
- **Store Selection**: Optional (can login without selecting a store, or can select any store)
- **Access**: 
  - All stores
  - All admin features
  - Store management
  - Cashier management
  - All dashboard pages

### 2. Admin
- **Username**: `admin`
- **Password**: `admin123`
- **Store Selection**: **Required** (must select a store from their assigned stores)
- **Access**:
  - Only their assigned store(s)
  - Admin dashboard
  - Cashier management (for their store)
  - All dashboard pages (filtered by store)
  - Cannot manage stores

### 3. Cashier
- **Username**: `cashier`
- **Password**: `cashier123`
- **Store Selection**: **Required** (must select a store from their assigned stores)
- **Access**:
  - Only their assigned store(s)
  - POS system (home page)
  - Cannot adjust prices
  - Cannot access admin dashboard
  - Cannot perform critical operations

## Login Flow

1. **Enter Credentials**: User enters username and password
2. **Store Selection** (for admin/cashier):
   - If user is admin or cashier, they must select a store
   - If no store is selected, the system returns available stores
   - User must select a store to proceed
3. **Super Admin**:
   - Can login without selecting a store
   - Can optionally select a store if needed
4. **Session Creation**: After successful login, a session is created with the user and store (if selected)
5. **Redirect**:
   - Cashiers → Home page (POS system)
   - Admins/Super Admins → Admin dashboard

## Restrictions

- **Cashiers**:
  - Cannot adjust prices in POS system
  - Cannot access `/admin` pages
  - Cannot perform critical operations
- **Admins**:
  - Can only manage data for their assigned store(s)
  - Cannot create/manage stores (super admin only)
  - Can create cashiers for their store(s)
- **Super Admins**:
  - Full access to everything
  - Can manage all stores
  - Can manage all users
















