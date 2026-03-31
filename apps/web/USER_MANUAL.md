# POS System User Manual (Practical Guide)

This manual is written for real usage, not just feature listing.  
It explains:

- how to set up the application correctly,
- how to run daily operations,
- what each section is for,
- how to interpret analytics/charts,
- what action to take from what you see.

---

## 1) Who this guide is for

- **Super Admin**: owner/operator with full control.
- **Admin**: manager-level operational user.
- **Cashier/Employee**: frontline POS user.

If you are training staff, start with:
1. Setup chapters (Sections 2-4),
2. POS operations (Sections 5-8),
3. Interpretation chapters (Sections 10-13),
4. Troubleshooting (Section 16).

---

## 2) Before you start (recommended checklist)

Before opening to customers:

1. Confirm one machine is designated as the **server** machine.
2. Confirm client machines can reach the server on LAN.
3. Confirm at least one store exists.
4. Confirm users have correct roles/permissions.
5. Confirm products have prices and stock.
6. Confirm payment settings are configured (if using M-Pesa).
7. Confirm at least one printer works on each checkout machine.

---

## 3) Setup guide (first-time)

## 3.1 Decide deployment model

### Server machine
Use this as your source-of-truth machine:
- hosts database,
- handles API for client machines.

### Client machines
Use for additional registers:
- UI runs locally,
- data comes from server machine.

When to use:
- **Single machine shop** -> server mode only.
- **Multi-counter/multi-PC shop** -> one server + multiple clients.

## 3.2 Configure client connection

On a client machine:
1. Open login page.
2. Choose server setup.
3. Enter server URL (`http://<server-ip>:<port>`).
4. Test connection.
5. Connect.

If disconnected later:
- re-open setup,
- verify IP/port,
- verify server is running and reachable.

## 3.3 Create organizational foundation

From Admin:
1. Create stores (if multi-store or scoped management).
2. Create users and assign roles.
3. Assign permissions for non-admin roles.
4. Assign users to stores.

Why this matters:
- without store assignment, staff may fail login or see empty data.
- without permissions, employees may be blocked from POS/admin screens.

---

## 4) Login and session behavior

After login:
- POS-focused users are routed to POS.
- Admin users are routed to dashboard/admin.

If a user logs in then is returned to login:
- check server/client mode mismatch,
- check store assignment and role permissions,
- check shift restrictions (if enabled),
- verify client-server connectivity.

---

## 5) POS page: how to use it correctly

The POS page is your live transaction workspace.

## 5.1 Product/Service selection section

Use this section when:
- starting a sale,
- adding missing items,
- searching by keyword/barcode.

Interpretation tips:
- **Low stock indicator** means inventory should be replenished soon.
- **Out of stock indicator** means item cannot be sold.
- **Expiry warnings** mean stock quality risk:
  - expired -> replace, do not continue casually,
  - near expiry -> sell cautiously and alert admin.

## 5.2 Cart section

Use this section to:
- verify customer order line-by-line,
- adjust quantity,
- remove mistakes before payment.

Best practice:
- always review total before payment,
- verify quantities match customer request.

## 5.3 Payment section

### Cash
Use when customer pays physically.
- enter received amount,
- confirm change when due.

### Card
Use when card is accepted in your process.

### M-Pesa
Use for mobile payments.
- payment may be asynchronous,
- transaction can move to waiting list until confirmation.

Interpretation:
- **Awaiting payment** = request sent, not yet finalized.
- **Failed payment** = retry or change method.

## 5.4 Parked carts / wait list

Use when:
- customer pauses transaction,
- payment is pending,
- cashier needs to continue serving others.

Interpret labels:
- **Paused**: manually parked, can resume.
- **Awaiting M-Pesa**: request in progress.
- **Failed payment**: needs retry or change.
- **Paid — confirm receipt**: finalize acknowledgement step.

Operational advice:
- review waiting list frequently to avoid forgotten sales.

---

## 6) Receipt printing flow (what to do and why)

After transaction confirmation:
1. App asks whether to print.
2. Choose:
   - continue without printing, or
   - open printer selector.

Printer selector is used to:
- choose local printer,
- discover LAN printers,
- print,
- retry on failure,
- cancel printing.

When to continue without printing:
- customer declines receipt,
- printer temporarily unavailable,
- urgent queue and receipt not mandatory.

When to insist on printing:
- legal/fiscal policy requires receipt,
- customer needs proof for return/warranty.

---

## 7) Products section: what it controls

Products define what POS can sell.

Use Products page to:
- create items,
- set selling price,
- set stock quantity/minimum level,
- add optional expiry date,
- maintain category structure.

Interpretation guidance:
- **Min stock level** is your internal warning threshold, not a hard stop.
- **Cost values** support profit analytics (managerial insight, not cashier action).
- **Expiry date** should reflect real shelf life, not purchase date.

When to update:
- every new product,
- every restock cycle,
- every major price change.

---

## 8) Inventory section: how to interpret and act

Inventory page is for stock health, not just viewing numbers.

## 8.1 What key statuses mean

- **Well stocked**: current stock above warning threshold.
- **Low stock**: reorder planning should begin.
- **Out of stock**: lost sales risk is already present.
- **About to expire**: prioritize sale or rotation.
- **Expired**: isolate and follow disposal/write-off policy.

## 8.2 What to do from each status

- Low stock -> create replenishment list.
- Out of stock -> reorder immediately for high-velocity items.
- About to expire -> promote/discount/rotate if policy allows.
- Expired -> remove from active sale pipeline and record loss according to policy.

## 8.3 Total value interpretation

Inventory value is useful for:
- working capital visibility,
- shrinkage/loss monitoring,
- identifying overstocked categories.

Do not interpret high inventory value alone as “good”:
- high value with low sales may indicate tied-up cash and slow movement.

---

## 9) Sales section: operational meaning

Sales page helps you answer:
- What sold?
- When?
- How was it paid?
- Which transactions are complete vs pending?

Use it for:
- end-of-day reconciliation,
- dispute resolution,
- payment audit checks.

Interpretation cues:
- rising count + stable average ticket may mean healthy footfall.
- falling count + rising ticket may mean fewer but larger baskets.
- high failed/pending rates indicate payment workflow issues.

---

## 10) Alerts section: how to use proactively

Alerts are action triggers, not passive notifications.

Recommended process:
1. Check alerts at shift start and mid-shift.
2. Categorize: urgent (stockout/critical) vs non-urgent.
3. Assign owner/action.
4. Resolve and verify change appears in relevant page.

If alerts are constantly ignored:
- they lose value and stock/service quality will degrade.

---

## 11) Expenses section: what it is really for

Expenses page captures costs outside direct sale lines (and configured cost integrations).

Use it to record:
- operational spending,
- recurring costs,
- exceptional losses where policy requires logging.

Interpretation:
- rising expenses with flat revenue compresses margin.
- stable expenses with rising revenue improves operating leverage.

Best practice:
- record expenses promptly and categorize accurately,
- avoid “miscellaneous” overuse.

---

## 12) Analytics section: chart interpretation and action

This section explains what users are seeing and how to reason about it.

## 12.1 Revenue

What it means:
- total sales value in selected filter window.

How to interpret:
- rising revenue can come from more transactions, higher ticket, or both.
- compare alongside sales count and expenses before concluding performance quality.

## 12.2 Expenses

What it means:
- recorded cost burden (manual + configured cost components).

How to interpret:
- expense increase is not always bad (could be growth investment).
- check whether revenue growth outpaces expense growth.

## 12.3 Profit / Margin

What it means:
- surplus after costs in the selected period.

How to interpret:
- margin % is better for trend comparison than absolute profit alone.
- low margin on high volume may still be risky if costs spike.

## 12.4 Trend charts

What they show:
- direction over time (up/down/stable) for metrics.

How to read:
- one-day spikes are noise unless repeated.
- 7/30-day trend lines are more reliable for decisions.

Use trend charts for:
- staffing planning,
- promotion timing,
- procurement scheduling.

## 12.5 Product/category performance charts

What they show:
- best/worst contributors.

How to use:
- top sellers -> protect stock availability.
- weak sellers -> review pricing, placement, or discontinue.
- high revenue but low margin items -> renegotiate cost or adjust strategy.

## 12.6 What not to do

- do not act on one chart in isolation.
- do not compare different time windows without normalization.
- do not interpret high revenue as success if margins collapse.

---

## 13) User management sections (Cashiers/Employees)

Use these pages to control who can do what.

Practical guidance:
- assign minimum permissions needed.
- document why elevated permissions are granted.
- review inactive users and deprovision quickly.

When creating employee accounts:
- verify store assignment,
- verify permissions required for intended workflow,
- test login on intended machine mode (server/client).

---

## 14) Network section (for super admin)

Use this page when:
- adding new client terminals,
- troubleshooting connection failures,
- validating server reachability.

Interpretation:
- healthy server info + failed client connection usually indicates LAN/firewall path issue.
- changing routers/subnets can break discovery; use manual URL setup.

---

## 15) Payment settings section

Use this section when:
- enabling/updating payment integrations,
- rotating credentials,
- validating gateway setup.

Operational note:
- change one parameter set at a time, then test with a small transaction.

---

## 16) Troubleshooting guide (task oriented)

## User cannot login on client
Check in order:
1. server URL reachable?
2. deployment mode correct?
3. user assigned to store?
4. required permissions assigned?
5. server running?

## POS shows pending/failed M-Pesa repeatedly
1. verify phone format,
2. check callback/network reliability,
3. retry from parked cart,
4. switch method if customer cannot wait.

## Printer cannot print
1. verify printer online,
2. choose another printer,
3. find LAN printers,
4. retry,
5. continue without printing if business policy permits.

## Inventory mismatch complaints
1. verify recent sales posted,
2. verify product stock edits,
3. check for out-of-stock and expired filters,
4. inspect manual adjustments history.

---

## 17) Daily operating playbook (recommended)

## Opening
1. login and verify connectivity,
2. check alerts,
3. verify key stock availability.

## During shift
1. process sales,
2. monitor parked/pending payments,
3. resolve failures quickly,
4. keep receipt process consistent.

## Midday management check
1. quick analytics review (revenue, margin trend),
2. inventory status review (low/out/expiring),
3. trigger restocking/escalations.

## Closing
1. clear pending payment confirmations,
2. reconcile sales totals,
3. log key expenses,
4. logout intentionally.

---

## 18) Training advice for teams

For new cashiers:
- train POS + payment + parked carts + receipt flow first.

For admins:
- train inventory interpretation and analytics decision-making, not only data entry.

For super admins:
- train network/setup, role governance, and periodic permission audits.

---

## 19) Cashier Training Script (Day 1 Onboarding)

Use this script to train a new cashier in a structured session.

## 19.1 Session objective
By the end of training, cashier should be able to:
- login correctly,
- complete cash and M-Pesa sales,
- handle parked carts,
- use receipt options safely,
- escalate issues correctly.

## 19.2 Trainer preparation checklist
Before training starts:
1. Create cashier account and assign correct permissions.
2. Assign cashier to correct store.
3. Confirm printer is connected.
4. Prepare 3 test products and 1 service.
5. Prepare one M-Pesa test number/process.

## 19.3 Walkthrough script (trainer speaks, cashier repeats)

### Step A: Login and context
- Explain: "This machine must be connected to the correct server."
- Cashier performs login.
- Trainer confirms cashier lands on POS page.

### Step B: Build a basic cart
- Search and add 2 products.
- Adjust quantity (increase/decrease).
- Remove one line item.
- Explain stock warnings and what to do when item is out of stock.

### Step C: Complete a cash sale
- Open payment modal.
- Select cash.
- Enter cash received.
- Confirm change where required.
- Complete sale.
- Handle receipt prompt:
  - print path,
  - continue-without-printing path.

### Step D: Complete M-Pesa sale
- Add a new cart.
- Select M-Pesa and send prompt.
- Show pending state in parked carts.
- Show confirmation flow when payment completes.

### Step E: Handle failure scenarios
- Simulate payment failure and retry.
- Park and resume a cart.
- Cancel printing and continue workflow.

## 19.4 Rules cashier must memorize
- Never force-complete payment without confirmation.
- Never ignore pending payment queues.
- Always verify total with customer before completion.
- If printer fails, retry once, then follow shop policy for no-print fallback.
- Escalate server/network issues to admin immediately.

## 19.5 Cashier practical test (pass/fail)
Cashier must complete all:
1. One successful cash sale.
2. One M-Pesa sale that enters and exits pending flow.
3. One parked cart resume.
4. One receipt print and one no-print continuation.
5. One failed payment retry.

---

## 20) Admin Weekly Review Routine (Operational Rhythm)

This routine helps admins use data for decisions, not just monitoring.

## 20.1 Weekly cadence
- **Daily (10-15 min):** alerts + pending items + low stock.
- **Mid-week (20-30 min):** inventory/expiry and trend check.
- **End-week (45-60 min):** full analytics review + action plan.

## 20.2 Monday opening review
1. Check Alerts page for unresolved issues.
2. Check Inventory for:
   - out-of-stock,
   - low-stock,
   - expiring/expired items.
3. Assign replenishment tasks with deadlines.

## 20.3 Mid-week performance check
On Analytics page review:
- revenue trend vs previous week midpoint,
- expense trend,
- gross profit direction,
- top and weak categories/products.

Interpretation prompts:
- If revenue up but margin down -> check costs/discounting.
- If stockouts high on best sellers -> adjust procurement timing.
- If many near-expiry items -> adjust ordering volumes or promotions.

## 20.4 Friday close review
1. Review weekly totals:
   - sales count,
   - total revenue,
   - expenses,
   - profit/margin.
2. Identify top 5 contributors and bottom 5 laggards.
3. Review payment quality:
   - failed payments,
   - unresolved pending items.
4. Review operational hygiene:
   - unresolved alerts,
   - stale parked carts,
   - user issues reported.

## 20.5 Weekly action board (recommended)
Maintain a simple board with:
- **Fix immediately (24h)**
- **This week**
- **Next cycle**

Examples:
- Immediate: recurring M-Pesa failures on one terminal.
- This week: reorder high-velocity stock.
- Next cycle: re-price low-margin products.

## 20.6 KPI interpretation cheat sheet
- **Sales count down + avg ticket up:** fewer customers, bigger baskets.
- **Sales count up + margin down:** possible over-discounting or higher costs.
- **Expenses up + revenue flat:** profitability pressure.
- **Expiry-risk stock rising:** procurement mismatch.

---

## 21) Super Admin SOP (Governance, Security, and Reliability)

Use this SOP for controlled, repeatable platform management.

## 21.1 Access governance SOP

Weekly:
1. Review all active users.
2. Verify role correctness.
3. Remove or deactivate stale accounts.
4. Audit high-privilege accounts (admin/super-admin).

Monthly:
1. Review permission sprawl for employee roles.
2. Enforce least-privilege model.
3. Rotate sensitive credentials where policy requires.

## 21.2 Network and deployment SOP

When adding a new client machine:
1. Confirm server health first.
2. Configure client mode with tested server URL.
3. Validate login from a standard employee account.
4. Validate POS transaction + receipt printing.
5. Record workstation name/location ownership.

When network issues occur:
1. Confirm server process is running.
2. Verify LAN reachability and firewall rules.
3. Re-test from login setup modal on affected clients.
4. Escalate infrastructure/router issues if cross-subnet path fails.

## 21.3 Payment reliability SOP

Daily:
1. Check for unresolved pending payments.
2. Review failed payment spikes by workstation.
3. Ensure callbacks and terminal connectivity are stable.

If failures spike:
1. Isolate whether issue is gateway, network, or workstation-specific.
2. Switch high-risk terminal to backup process while fixing.

## 21.4 Data quality SOP

Daily:
- ensure products/prices/stock updates are current.

Weekly:
- review expense categorization quality,
- review inventory anomalies (negative/abnormal patterns),
- check for repeated manual corrections.

## 21.5 Backup and continuity SOP

Minimum policy recommendation:
- Daily backup of server-side database.
- Keep rolling retention (for example last 14-30 days).
- Test restore procedure at least monthly.

## 21.6 Incident response SOP

If critical incident occurs (cannot login, cannot process sale, data mismatch):
1. Classify severity:
   - **P1**: cannot process sales across store.
   - **P2**: one terminal affected.
   - **P3**: non-blocking reporting issue.
2. Record:
   - time,
   - affected users/machines,
   - visible error symptoms.
3. Apply temporary workaround (backup terminal/method).
4. Escalate to technical owner with clear reproduction notes.

## 21.7 Compliance and audit SOP

Super admins should:
- keep Activity Log review cadence,
- maintain accountability for privilege changes,
- ensure financial records (sales/expenses) are reviewed and reconciled regularly.


# POS Application User Manual (Detailed)

This manual explains the app in a practical, page-by-page way:

- what each page is for,
- what each page contains,
- what actions users can perform,
- how common workflows move between pages.

---

## 1. Application Structure

The application has two primary zones:

- **POS zone** (`/pos`) for transactional work.
- **Admin zone** (`/admin` and sub-pages) for management, reporting, and setup.

Which pages a user can access depends on role and permissions.

---

## 2. Roles and Typical Access

## Super Admin
- Full administrative access across stores and settings.
- Can access super-admin-only sections (for example Activity Log, Network, Stores, Payments).

## Admin
- Broad management access for operational pages.
- Usually cannot access super-admin-only restricted controls.

## Cashier / Employee
- Primarily POS operations.
- Access to admin pages depends on specific permissions assigned by administrators.

---

## 3. Login Page (`/login`)

### Purpose
Authenticate users and establish a session for POS or Admin workflows.

### What this page contains
- Username field
- Password field
- Login button
- Connection status indicator (server/client connectivity)
- Recovery/fallback options after repeated failed attempts
- Client server-setup action

### Connection status behavior
- **Server mode**: should show local/standalone readiness.
- **Client mode**: shows connected/disconnected state to remote POS server.

### Server setup from login
If disconnected in client mode, users can:
1. Open server setup.
2. Enter server address (`http://<ip>:<port>`).
3. Test connection.
4. Connect if reachable.

Users can also choose to continue in standalone mode where appropriate.

### Successful login behavior
- Cashier/pos-focused users -> redirected to POS (`/pos`).
- Admin/super-admin users -> redirected to Admin dashboard (`/admin`).

---

## 4. POS Page (`/pos`)

This is the main register interface for sales and payment completion.

## 4.1 Page layout

### Left/main side
- Product and service browsing tabs.
- Search and scan support.
- Product/service cards with pricing and availability.

### Right side (cart panel)
- Current cart items.
- Quantity controls.
- Remove item action.
- Running total.
- Proceed to payment button.

### Auxiliary overlays/modals
- Payment modal.
- Parked carts modal.
- M-Pesa payment confirmation modal.
- Receipt print prompt/modal.

## 4.2 Product interactions

From product cards users can:
- add products to cart,
- see stock indicators,
- get warnings for low stock / out of stock,
- receive expiry warnings where configured.

### Expiry behavior in POS
- Expired items produce explicit warnings.
- Near-expiry items produce caution warnings.
- Cart item row can display expiry warning text.

## 4.3 Service interactions

Users can add services and configure service-specific inputs:
- adjustable price services,
- calculated services (for example page count + print type).

## 4.4 Cart behavior

In cart users can:
- increase/decrease quantities,
- remove items,
- view total in real time.

Stock limits are enforced for products when changing quantity.

## 4.5 Payment modal

Payment methods supported:
- Cash
- Card
- M-Pesa

### Cash flow
- Enter cash received.
- System computes change.
- If change is due, cashier confirms change has been given before completion.

### Card flow
- Simple completion path via selected payment method.

### M-Pesa flow
- Enter customer phone.
- Sale can move to pending/awaiting state.
- Pending sales are tracked in parked carts.

## 4.6 Parked carts and waiting list

This section supports:
- pausing a cart,
- resuming a paused cart,
- retrying failed payments,
- monitoring M-Pesa awaiting items,
- confirming completed pending payments.

## 4.7 Receipt printing flow

After transaction confirmation:
1. User sees **Print receipt?** prompt.
2. User may:
   - continue without printing, or
   - choose printer.

In printer modal:
- available local printers are listed,
- user can search/discover LAN printers,
- user can print receipt,
- user can cancel printing,
- if printing fails, user can retry.

---

## 5. Admin Dashboard (`/admin`)

### Purpose
Central operations landing page.

### Typical page contents
- summary metrics,
- quick status indicators,
- links/drill-through to detailed pages.

---

## 6. Products Page (`/admin/products`)

### Purpose
Create and maintain products used in POS and inventory.

### Typical contents
- product list with search/filter,
- add/edit product modal,
- delete action.

### Product form fields (typical)
- Product name
- Barcode/SKU
- Selling price
- Stock quantity
- Min stock level
- Category
- Description
- Cost fields (purchase totals/unit cost paths)
- **Expiry date (optional)**

### Main actions
- create product,
- edit product,
- delete product.

Sensitive actions can require password confirmation where configured.

---

## 7. Services Page (`/admin/services`)

### Purpose
Manage service catalog.

### Typical contents
- service list/grid,
- add/edit form,
- pricing mode configuration:
  - fixed,
  - adjustable,
  - calculated.

---

## 8. Sales Page (`/admin/sales`)

### Purpose
Review transactional history.

### Typical contents
- sales table/list,
- filters by date/status/type,
- detail view for individual transactions.

---

## 9. Inventory Page (`/admin/inventory`)

### Purpose
Track stock levels, value, and stock health.

### What this page contains
- inventory stats cards,
- filters (search/category/status),
- detailed product inventory table,
- export options.

### Status filters
- All stock levels
- Low stock only
- Out of stock only
- About to expire
- Expired only

### Inventory table typically includes
- product name/description,
- category,
- stock level + minimum threshold,
- unit price,
- total stock value,
- status badge.

---

## 10. Alerts Page (`/admin/alerts`)

### Purpose
Operational alert management (for example low stock and similar risk states).

### Typical actions
- inspect active alerts,
- filter alert types,
- resolve or mark alerts where available.

---

## 11. Analytics Page (`/admin/analytics`)

### Purpose
Understand performance and profitability.

### Typical contents
- revenue and profit snapshots,
- expense and profitability charts,
- item/category trend views,
- filter controls (date/category/etc).

### Filter behavior
- analytics values refresh according to selected filters.
- clear-filter control resets to baseline view.

---

## 12. Expenses Page (`/admin/expenses`)

### Purpose
Track non-sale costs and operational spending.

### Typical contents
- expense list,
- add/edit/delete expense workflows,
- category/date fields,
- reporting and export support.

---

## 13. User Management

## 13.1 Cashiers Page (`/admin/cashiers`)
- create and manage cashier users,
- assign permissions,
- update activation and access state.

## 13.2 Employees Page (`/admin/employees`)
- create/manage employee users (including custom role users),
- assign stores,
- assign permissions,
- manage account details.

---

## 14. Stores Page (`/admin/stores`) [super-admin focused]

### Purpose
Manage store entities used by access and reporting.

### Actions
- create/edit stores,
- activate/deactivate stores,
- maintain valid store assignments for users.

---

## 15. Network Page (`/admin/network`) [super-admin focused]

### Purpose
Set up and maintain multi-machine LAN deployment.

### Typical page elements
- server info (detected URL/port),
- workstation info,
- scan/discovery actions,
- API base guidance for client machines.

### Typical tasks
- discover server machine on LAN,
- copy suggested server URL,
- configure client machines to correct API base.

---

## 16. Payment Settings (`/admin/payment-settings`) [super-admin focused]

### Purpose
Configure payment integrations and credentials.

### Typical contents
- M-Pesa/Daraja config fields,
- card/stripe-related fields if enabled,
- save/apply controls.

---

## 17. Themes Page (`/admin/themes`)

### Purpose
Manage look-and-feel of the application.

### Typical behavior
- preview/apply themes,
- persist active theme,
- client machines follow server theme in distributed mode.

---

## 18. Activity Log (`/admin/activity-log`) [super-admin only]

### Purpose
Audit-oriented administrative trail and controls.

### Access rule
- only super admins can access this page and corresponding APIs.

---

## 19. AI Chat Page (`/admin/ai-chat`) (if enabled)

### Purpose
AI-assisted guidance and insight surface for admin workflows.

---

## 20. Common End-to-End Flows

## 20.1 Cash sale with receipt
1. Add items in POS.
2. Proceed to payment.
3. Select cash and confirm change if required.
4. Complete sale.
5. Decide whether to print receipt.

## 20.2 M-Pesa pending to confirmation
1. Create M-Pesa payment.
2. Sale moves to awaiting state.
3. Confirm payment once callback updates status.
4. Optionally print receipt after confirmation.

## 20.3 Client machine reconnection
1. Open login server setup.
2. Enter/test server URL.
3. Connect and retry login.

---

## 21. Troubleshooting by Page

## Login
- disconnected state: re-test URL/network/firewall/server uptime.

## POS
- cash blocked: check tendered amount and change-confirmation requirement.
- M-Pesa stalled: inspect awaiting entries in parked carts.
- printer errors: retry, switch printer, or continue without printing.

## Inventory/Products
- missing product in POS: verify stock > 0 and product active.
- expiry filter empty: verify expiry date data exists.

## Admin pages
- missing menu entries: likely role/permission restriction.
- unauthorized page: verify account role and permission assignment.

---

## 22. Daily Operations Checklist

1. Confirm machine mode and connectivity.
2. Login and verify role access.
3. Process sales and clear pending payment items.
4. Review low/expiring stock.
5. Print receipts as required by policy.
6. Reconcile sales/expenses.
7. Logout intentionally at shift close.

# POS Application User Manual

## 1) Overview

This application is a hybrid desktop POS and admin platform designed for:

- Daily point-of-sale operations (cash, card, M-Pesa).
- Multi-user workflows (super admin, admin, cashier, and custom employee permissions).
- Multi-machine LAN deployments (server + client machines).
- Inventory, analytics, expenses, and operational controls.

The app can run in two modes:

- **Server mode**: This machine hosts the primary API + SQLite database.
- **Client mode**: This machine connects to a remote server machine on the LAN.

---

## 2) Roles and Access

### Super Admin
- Full system access.
- Can configure network, stores, payment settings, users, and themes.
- Can access Activity Log.

### Admin
- Operational management access for assigned scope.
- Can work in admin dashboards and manage day-to-day data.
- Cannot perform super-admin-only actions (like restricted global controls).

### Cashier / Employee
- POS-first workflow.
- Access depends on assigned permissions.
- May be limited from price edits, critical actions, or admin screens.

---

## 3) First-Time Setup

## 3.1 Activate and sign in
1. Complete bootstrap/activation steps if prompted.
2. Sign in with provided credentials.

## 3.2 Choose deployment mode
- **If this is the main machine**: use **Server mode**.
- **If this is an extra terminal**: use **Client mode** and connect to the server URL.

## 3.3 Client machine setup
On login page (client mode), if server is unreachable:

1. Select **Set up server again**.
2. Enter server URL (`http://<server-ip>:<port>`).
3. Use **Test connection**.
4. Use **Connect to this server** when reachable.

---

## 4) Login and Sessions

- Enter username + password on login page.
- If credentials are valid and account has required access, user is redirected:
  - POS users/cashiers -> `/pos`
  - admins/super admins -> `/admin`
- Session is maintained until logout, forced session expiry, or explicit invalidation.

If login fails immediately:
- Verify machine mode (Server vs Client).
- Verify server reachability.
- Verify user permissions and assigned stores.

---

## 5) POS Workflow

## 5.1 Start a sale
1. Search or scan a product.
2. Add products/services to cart.
3. Adjust quantities as needed.
4. Proceed to payment.

## 5.2 Payment methods
- Cash
- Card
- M-Pesa

For cash:
- Enter cash received.
- Confirm change given (when applicable) before completing.

For M-Pesa:
- Enter customer phone.
- Pending/awaiting sales are tracked in parked carts until payment confirmation.

## 5.3 Parked carts / wait list
Use parked carts to:
- Pause a cart.
- Resume later.
- Retry failed payments.
- Confirm completed M-Pesa receipts and clear wait list items.

---

## 6) Receipt Printing

After successful transaction confirmation:

1. A **Print receipt?** prompt appears.
2. Choose:
   - **Continue without printing**, or
   - **Choose printer**.
3. In print modal:
   - Select a local printer.
   - Optionally use **Find printers on LAN**.
   - Click **Print receipt**.
   - If print fails, use **Retry**.
   - Use **Cancel printing** to exit without printing.

Notes:
- Client machines list locally connected printers first.
- LAN printer discovery can add network printers where available.

---

## 7) Inventory Management

Inventory screen supports:
- Product stock visibility.
- Low stock and out-of-stock status.
- Category and stock filters.
- Expiry-aware filtering:
  - About to expire
  - Expired only

Product creation/edit supports optional:
- Costing information (used for analytics)
- **Expiry date**

---

## 8) Product and Service Management

Products:
- Create/edit/delete products.
- Define price, stock, min threshold, category, notes.
- Optional expiry date.

Services:
- Create and price fixed/adjustable/calculated services.
- Use service pricing tools during POS operations.

---

## 9) Admin Areas

Common admin pages include:
- Dashboard
- Products
- Services
- Sales
- Inventory
- Alerts
- Analytics
- Expenses
- User management (cashiers/employees)
- Stores
- Network
- Payments
- Themes

Visibility and actions vary by role/permissions.

---

## 10) Activity Log Access

- Activity Log access is restricted to **Super Admin** only.
- Non-super-admin users cannot access the page/API.

---

## 11) Analytics and Financial Metrics

Analytics include:
- Sales volume and revenue.
- Expense tracking.
- Product profitability trends.
- Cost-of-goods impact.

The system considers product cost tracking in profit calculations and includes configured expenses in financial summaries.

---

## 12) Network and Multi-PC Operations

In multi-machine usage:

- Server machine hosts live data.
- Client machines point to server API URL.
- Health checks and discovery can be used from network screens.

For LAN stability:
- Keep all machines on reachable subnets.
- Ensure server firewall allows required inbound traffic.

---

## 13) Common Troubleshooting

## Cannot login on client
- Confirm server URL is correct.
- Test connection from login setup modal.
- Verify user permissions/store assignment.
- Confirm server app is running.

## Disconnected indicator on login page
- Re-test server health.
- Re-enter server URL.
- Check LAN/firewall.

## Printing failed
- Confirm printer is online.
- Retry from print modal.
- Switch printer and retry.
- Use continue/cancel if you must proceed without printout.

## M-Pesa pending state
- Use parked carts and pending sale confirmation flow.
- Confirm receipt after payment is marked complete.

---

## 14) Security and Best Practices

- Keep super admin credentials restricted.
- Use least-privilege role assignments.
- Require password confirmation for sensitive actions where configured.
- Perform periodic backups from server machine.

---

## 15) Recommended Daily Routine

1. Verify correct mode (server/client) and login health.
2. Check alerts and low/expiring stock.
3. Process sales and confirm pending payment completions.
4. Print receipts as required by policy.
5. Reconcile cash and sales before close.
6. Logout intentionally at shift end.

