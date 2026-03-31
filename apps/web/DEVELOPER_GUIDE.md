# POS Application Developer Guide (Detailed)

This guide documents the application from a developer perspective with emphasis on page behavior, module responsibilities, data contracts, and extension patterns.

---

## 1. Repository and Runtime Topology

## 1.1 Core directories
- `apps/web/src/app`
  - frontend pages and route-level UI logic.
- `apps/web/src/utils`
  - shared frontend utilities (`apiClient`, auth hooks, discovery helpers, etc).
- `apps/web/__create/route-builder.ts`
  - API surface and business logic (auth, inventory, sales, analytics, permissions, etc).
- `apps/web/lib/sqlite-schema.ts`
  - SQLite schema creation and migration guards.
- `apps/web/src-tauri/src`
  - native bridge commands, app lifecycle, background services.

## 1.2 Runtime modes
- **Server mode**
  - frontend and API are same-origin.
  - local database is source of truth.
- **Client mode**
  - frontend points to remote API base URL.
  - auth commonly relies on bearer fallback because cookie `SameSite=Lax` can be cross-origin constrained.

---

## 2. Page-by-Page Technical Map

## 2.1 Login page (`src/app/login/page.jsx`)

### Responsibilities
- Primary credential authentication UI.
- Client connectivity detection and remediation UX.
- Role-based post-login route redirection.
- Recovery panel handling for failed attempts.

### Key flows
- calls `POST /api/auth/login`,
- hydrates auth via `useAuth.applyLoginFromResponse`,
- redirects:
  - cashier/pos users -> `/pos`,
  - admin/super admin -> `/admin`.

### Client-mode mechanics
- checks server reachability before login,
- includes setup modal for API base URL update and test,
- updates deployment mode/base URL using `apiClient` utilities.

---

## 2.2 POS page (`src/app/pos/page.jsx`)

### Responsibilities
- cart and checkout engine,
- payment workflows (cash/card/mpesa),
- parked-cart queue management,
- pending M-Pesa confirmation loop,
- post-success receipt flow and printing UI.

### Important state groups
- cart state and quantity mutation handlers,
- payment modal state (`showPayment`, method-specific inputs),
- parked cart registry state,
- M-Pesa pending ack state (`paymentAckModal`),
- receipt state (`receiptPrompt`, `showReceiptPrintModal`, printer list, retry errors).

### Key API interactions
- products/services query fetches,
- sale creation mutation,
- M-Pesa push mutation,
- sale status polling for pending M-Pesa records.

### Receipt implementation details
- pre-print prompt opens only after successful transaction confirmation path,
- print modal supports:
  - local printer load,
  - LAN printer merge,
  - print dispatch,
  - cancel and retry.
- native printing is invoked through Tauri commands.

---

## 2.3 Admin layout (`src/app/admin/layout.jsx`)

### Responsibilities
- auth and access boundary for admin tree,
- guarded rendering of outlet content,
- redirect orchestration when unauthenticated.

### Caveats
- session re-check retries exist to reduce transient redirects.
- any auth timing change should be tested for race regressions between login and route mount.

---

## 2.4 Admin sidebar (`src/app/admin/AdminSidebar.jsx`)

### Responsibilities
- role-aware navigation rendering,
- active route switching,
- visibility filtering by role requirements.

### Security alignment
- sidebar visibility must always match server authorization rules.
- do not rely on nav hiding alone for protection.

---

## 2.5 Products page (`src/app/admin/products/page.jsx`)

### Responsibilities
- CRUD for product records,
- cost metadata capture for inventory/analytics,
- optional expiry date capture.

### Form data model
Includes fields for:
- pricing,
- stock,
- category/description,
- costing paths,
- `expiry_date`.

### API contract
- create/update payload forwards form fields to `/api/products`.

---

## 2.6 Inventory page (`src/app/admin/inventory/page.jsx`)

### Responsibilities
- inventory visibility and stock-state filtering,
- category/stock/expiry filter UI,
- export workflows.

### Filter contract
- frontend sends:
  - `lowStock=true` for low filter,
  - `expiry=about_to_expire|expired` for expiry filters.
- backend resolves these in products route query.

---

## 2.7 Sales page (`src/app/admin/sales/page.jsx`)

### Responsibilities
- display and filter sale history,
- support sale detail inspection,
- support operational review of payment outcomes.

---

## 2.8 Alerts page (`src/app/admin/alerts/page.jsx`)

### Responsibilities
- list operational alerts,
- provide triage interfaces where implemented.

---

## 2.9 Analytics page (`src/app/admin/analytics/page.jsx`)

### Responsibilities
- chart/report rendering from analytics APIs,
- filter-state management and clear/reset flow.

### Financial model touchpoints
- summary endpoints combine revenue and expense/cost components.
- ensure frontend labels align with backend formula semantics.

---

## 2.10 Expenses page (`src/app/admin/expenses/page.jsx`)

### Responsibilities
- expense CRUD and categorization.
- forms map directly to `/api/expenses` routes.

---

## 2.11 Cashiers/Employees pages

### Responsibilities
- user CRUD,
- store assignment,
- permission assignment.

### Integration notes
- new employee credentials must remain login-compatible on client mode.
- changes in role logic should be validated against login and route guards.

---

## 2.12 Network page (`src/app/admin/network/page.jsx`)

### Responsibilities
- deployment diagnostics and setup assistance.
- machine/server URL visibility.
- LAN discovery and client setup support.

### Dependencies
- `lanDiscovery` utility
- server endpoints like `/api/server-info` and health checks.

---

## 2.13 Payments settings page

### Responsibilities
- payment provider credential persistence.
- compatibility with runtime payment handlers.

---

## 2.14 Themes page

### Responsibilities
- theme selection and persistence.
- server theme propagation for client-mode machines.

---

## 2.15 Activity log page

### Security
- super-admin-only by UI and API.
- maintain strict parity whenever routes/navigation change.

---

## 3. API Layer Details (`__create/route-builder.ts`)

## 3.1 Auth endpoints
- `/auth/login`
- `/auth/session`
- `/auth/logout`

### Important behavior
- login returns `sessionToken` for bearer path,
- session accepts cookie or bearer token via `getPosSessionToken`.

## 3.2 Products endpoints
- list/create/update/delete.
- include stock and optional expiry filtering.

## 3.3 Sales/payment endpoints
- sale persistence,
- payment status retrieval,
- M-Pesa callback and status workflows.

## 3.4 Analytics endpoints
- summary
- profitability
- trend/filter-specific detail endpoints.

---

## 4. Data Layer Notes (`lib/sqlite-schema.ts`)

## 4.1 Migration style
- guard each additive migration by checking existing columns.
- avoid destructive migration assumptions for deployed databases.

## 4.2 Relevant tables
- `products` (includes `cost_price`, `expiry_date` when migrated)
- `inventory_lots` (FIFO cost layers)
- `sale_items` (supports `cogs_amount`)
- `expenses`
- auth/store/user tables.

---

## 5. Desktop Bridge (Tauri)

## 5.1 Command registration (`src-tauri/src/lib.rs`)
All native commands must be exported in `invoke_handler`.

## 5.2 Printer bridge (`src-tauri/src/printer.rs`)
Current commands:
- `list_local_printers`
- `list_lan_printers`
- `print_receipt_text`

Current implementation:
- Windows PowerShell-backed listing and printing.
- Intended for desktop builds (not browser-only runtime).

---

## 6. Critical Cross-Cutting Concerns

## 6.1 Auth race prevention
- `useAuth` has state coherence logic to avoid login-check race regressions.
- test login on client/server modes after auth edits.

## 6.2 Role/permission parity
- enforce authz in backend even when page is hidden in UI.

## 6.3 Client mode request headers
- `apiFetch` adds workstation and deployment headers.
- bearer token propagation is required for cross-origin session continuity.

## 6.4 Modal state sequencing
- for POS payment/receipt flows, state order matters.
- avoid clearing payload state before downstream modal actions consume it.

---

## 7. Testing Matrix (Recommended)

## 7.1 Auth & routing
- login success by role,
- client-mode login against remote server,
- no immediate bounce after successful login.

## 7.2 POS
- add/update/remove cart,
- cash/card/mpesa completion paths,
- parked cart save/resume/retry,
- pending M-Pesa ack.

## 7.3 Receipt printing
- print prompt appears after confirmed sale,
- skip without print,
- choose local printer and print,
- LAN discovery action,
- cancel printing,
- retry after simulated print failure.

## 7.4 Admin
- page access by role,
- activity log super-admin lockout for others,
- inventory expiry filters.

## 7.5 Build checks
- frontend lint/check for edited files,
- `cargo check` for Tauri/native command changes.

---

## 8. Extension Guidance

## 8.1 When adding a new page
1. Add route/page component.
2. Add sidebar entry with role constraints.
3. Add API endpoints with explicit authz.
4. Add manual test steps to this guide.

## 8.2 When changing analytics formulas
1. Document old vs new semantics.
2. Update backend query logic.
3. Verify chart labels and API expectations.
4. Reconcile with expenses/COGS definitions.

## 8.3 When adding native capabilities
1. Add Rust module + command functions.
2. Register in `invoke_handler`.
3. Add JS invoke wrapper.
4. Handle graceful fallback/errors in browser/non-tauri contexts.

---

## 9. Operational Documentation Pointers

- User-facing operational detail: `USER_MANUAL.md`
- Network deployment specifics: `NETWORK_SETUP.md`
- Login and auth notes: `LOGIN_REQUIREMENTS.md`
- Payment gateway setup: `DARAJA_SETUP.md`, `API_SETUP_INSTRUCTIONS.md`

# POS Application Developer Guide

## 1) Purpose

This document is a developer-focused reference for architecture, workflows, and implementation conventions in this POS project.

It is intended to help contributors:
- Understand runtime topology (web + Tauri + API).
- Safely extend features (auth, POS, inventory, analytics, printing).
- Debug and ship changes with minimal regressions.

---

## 2) Project Structure (high level)

- `apps/web/src/app/*`
  - React app pages and UI flows (POS, admin, login, etc).
- `apps/web/src/utils/*`
  - shared client utilities (`apiClient`, auth helpers, LAN discovery, etc).
- `apps/web/__create/route-builder.ts`
  - core API routing and domain logic (auth, products, sales, analytics, etc).
- `apps/web/lib/sqlite-schema.ts`
  - SQLite schema + migration guards.
- `apps/web/src-tauri/src/*`
  - native desktop bridge (Tauri commands, lifecycle, network/launch helpers).

---

## 3) Runtime Architecture

## 3.1 Frontend
- React + route-based app in `src/app`.
- POS and admin pages use react-query mutations/queries for API operations.

## 3.2 API layer
- Hono routes generated in `__create/route-builder.ts`.
- SQLite persistence via direct SQL / prepared statements.
- Session handling supports cookie and bearer token paths.

## 3.3 Desktop bridge
- Tauri wraps the app for desktop deployment.
- Native commands exposed via `invoke_handler` in `src-tauri/src/lib.rs`.

---

## 4) Deployment Modes

The app supports:

- **Server mode**
  - same-origin API.
  - local machine is source of truth DB.

- **Client mode**
  - remote API base URL from localStorage (`POS_API_BASE_URL`).
  - requests use `apiFetch()` with workstation headers and bearer fallback.

Key localStorage/session keys:
- `POS_API_BASE_URL`
- `POS_DEPLOYMENT_MODE`
- `POS_DISCOVERY_HTTP_PORT`
- `POS_SESSION_TOKEN` (sessionStorage)

---

## 5) Authentication & Session Model

## 5.1 Login flow
- `POST /api/auth/login` returns:
  - user object
  - store object (when applicable)
  - `sessionToken` for bearer fallback

## 5.2 Client auth hydration
- `useAuth` applies login response directly to avoid race-induced redirects.
- `checkSession()` validates session and updates auth state.

## 5.3 Session token transport
- Cookie (`session_token`) where same-site rules permit.
- `Authorization: Bearer <POS_SESSION_TOKEN>` for client cross-origin compatibility.
- Server accepts cookie or bearer (see `getPosSessionToken()`).

---

## 6) Roles, Permissions, and Authorization

- Role checks are enforced in both UI and API layers.
- Super-admin-only surfaces must be locked in:
  - sidebar visibility
  - route handlers

Example: Activity Log is restricted to super admin at both UI nav and API endpoints.

---

## 7) POS Domain Flows

## 7.1 Core sale flow
- Build cart from products/services.
- Validate stock and payment prerequisites.
- Persist sale via API mutation.
- Handle success/failure with toasts and parked cart logic.

## 7.2 M-Pesa async flow
- Create pending sale.
- Initiate STK push.
- Track pending states in parked carts.
- Confirm payment and clear waiting item when callback marks complete.

## 7.3 Receipt print flow
Recent implementation adds:
- post-transaction receipt prompt.
- skip-print option.
- printer selection modal.
- local and LAN printer discovery.
- cancel and retry behavior.

Files:
- POS UI: `src/app/pos/page.jsx`
- Tauri printer bridge: `src-tauri/src/printer.rs`
- Tauri command registration: `src-tauri/src/lib.rs`

---

## 8) Inventory, Costing, and Analytics

## 8.1 Cost tracking
- `products.cost_price` available for baseline cost.
- `inventory_lots` table tracks FIFO unit cost layers.
- `sale_items.cogs_amount` supports per-line COGS.

## 8.2 Expiry support
- `products.expiry_date` (TEXT ISO date).
- products API supports `expiry=about_to_expire|expired`.
- inventory UI can filter by expiry status.

## 8.3 Analytics
- Summary combines revenue with expenses and cost-of-goods path.
- Profitability endpoints use product/service rollups.

When changing formulas:
1. update route-builder query logic,
2. verify API response contracts used by dashboards,
3. validate with sample seeded data.

---

## 9) Tauri Native Printing Bridge (current implementation)

`src-tauri/src/printer.rs` currently provides:
- `list_local_printers`
- `list_lan_printers`
- `print_receipt_text`

Current behavior:
- Windows-first via PowerShell (`Win32_Printer`, `Out-Printer`).
- Returns printer metadata and sends raw text to selected queue.

Recommended future hardening:
- cross-platform support (`cups`/platform abstraction).
- richer receipt formatting (ESC/POS templates).
- printer capability detection (paper width, status).

---

## 10) API Contract Notes (selected)

- `/api/auth/login`
  - returns session token + hydrated user/store.
- `/api/auth/session`
  - canonical authenticated state endpoint.
- `/api/products`
  - supports search/category/lowStock/expiry filters.
- `/api/analytics/*`
  - powers dashboard summaries and chart views.

When changing contracts:
- keep response shape backward-compatible when possible.
- update both UI callers and any dependent utilities.

---

## 11) Development Workflow

1. Create focused branch or worktree.
2. Implement in smallest vertical slice possible.
3. Validate:
   - frontend lint
   - Tauri compile (`cargo check`)
   - key user flows manually
4. Only then broaden scope.

For risky changes:
- instrument with temporary logs,
- verify with runtime evidence,
- remove instrumentation after confirmation.

---

## 12) Testing Checklist (manual)

For feature work touching POS/auth/network:

1. Server-mode login (all major roles).
2. Client-mode login against remote server URL.
3. Cart add/update/remove and stock constraints.
4. Payment success/failure (cash/card/mpesa).
5. Parked carts retry/resume paths.
6. Receipt prompt + printer modal actions:
   - skip
   - local printer print
   - LAN search
   - cancel
   - retry on failure
7. Admin pages load with correct role gating.
8. Super-admin-only pages blocked for non-super-admin.

---

## 13) Common Pitfalls

- Treating UI-only role checks as sufficient (always enforce API authz too).
- Breaking client-mode auth by assuming cookies always flow cross-origin.
- Updating schema fields without migration guards in `sqlite-schema.ts`.
- Changing analytics formulas without validating dashboard expectations.
- Closing modal state in the wrong order (can invalidate pending payloads).

---

## 14) Extension Recommendations

## Printing
- Add HTML/PDF receipt template option.
- Add automatic default printer per workstation.
- Save last selected printer in localStorage.

## Inventory/expiry
- Add batch-level expiry (not only product-level).
- Add explicit write-off endpoints with password confirmation + loss journaling.

## Analytics
- Separate:
  - manual expenses,
  - COGS,
  - expiry losses,
  - operational overhead
for clearer reporting.

---

## 15) Contribution Standards

- Prefer additive, explicit changes over broad refactors.
- Keep naming and response structures consistent with existing conventions.
- Add brief, meaningful comments only where logic is non-obvious.
- Avoid regressions in auth/session and POS payment safety flows.

