# Tauri App Launch and Close Lifecycle

## How the App Launches

When you run `npm run dev:tauri`, here's what happens:

1. **Command Execution**: `npm run dev:tauri` → executes `tauri dev`

2. **Tauri Configuration**: Tauri reads `apps/web/src-tauri/tauri.conf.json`:
   - `beforeDevCommand: "npm run dev"` - Starts React dev server on port 4000
   - `devUrl: "http://localhost:4000"` - Tauri loads the web app from this URL
   - Window settings: 1200x800, resizable, title "Dreamnet Media Tech"

3. **Rust Backend**: `apps/web/src-tauri/src/lib.rs`:
   - Creates a Tauri application using `tauri::Builder::default()`
   - Sets up logging plugin in debug mode
   - Runs the app with `tauri::generate_context!()`

4. **Frontend Loading**:
   - React dev server serves the app at `http://localhost:4000`
   - Tauri webview loads this URL
   - React app initializes and checks for session

5. **Session Check**:
   - `useAuth` hook runs `checkSession()` on mount
   - Checks for `app_start_time` in sessionStorage
   - If missing and previous session exists → invalidates session
   - If present → validates session with backend

## How the App Closes

When you click the X button:

1. **Window Close Event**: Tauri webview fires close event
2. **Event Handlers**:
   - **Tauri-specific**: `appWindow.onCloseRequested()` (if Tauri API available)
   - **Browser fallback**: `beforeunload` event (always works)
3. **Confirmation Dialog**: Browser shows "Are you sure you want to leave this page?"
4. **If User Confirms**:
   - `unload`/`pagehide` events fire
   - Session markers cleared: `app_start_time`, `session_active`
   - `browser_closing` flag set
   - Logout API called via `sendBeacon`
   - Window closes
5. **If User Cancels**: Window stays open, session remains active

## Current Issues

1. **Tauri API Not Detected**: `window.__TAURI__` exists but appears empty
   - This might be because `@tauri-apps/api` package is not installed
   - Or Tauri v2 injects API differently

2. **Close Handler Not Working**: 
   - Tauri-specific handler not firing
   - Browser `beforeunload` should work as fallback but might not be showing dialog

## Solution

Use browser's `beforeunload` event which works in both browser and Tauri webview:
- Set `e.preventDefault()` and `e.returnValue = ''` to show confirmation
- Handle cleanup in `unload`/`pagehide` events
- Clear session markers when user confirms close


