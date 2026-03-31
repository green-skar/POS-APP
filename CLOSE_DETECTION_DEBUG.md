# Window Close Detection Debug Guide

## How the App Detects Window Close (X Button Click)

### Event Flow

1. **User clicks X button** → Tauri/webview fires close event
2. **`beforeunload` event fires** → This is the key event that detects window close
3. **Handler checks conditions** → Determines if confirmation dialog should show
4. **If confirmed** → `unload` and `pagehide` events fire → Session cleared

### Event Handlers Registered

The app registers three event handlers:

1. **`beforeunload`** - Fires when window is about to close
   - **Purpose**: Show confirmation dialog
   - **Key**: This is where we detect the X button click
   - **Works in**: Browser and Tauri webview

2. **`unload`** - Fires when page is unloading
   - **Purpose**: Cleanup if user confirmed close
   - **Note**: May not fire in all browsers/Tauri

3. **`pagehide`** - Fires when page is hidden
   - **Purpose**: Cleanup (more reliable than unload)
   - **Works in**: Modern browsers and Tauri

### Detection Logic

The `beforeunload` handler checks:

1. **Is this intentional navigation?**
   - Checks `sessionStorage.getItem('intentional_navigation')`
   - If `true` → Skip dialog (user is navigating, not closing)
   - If `false` → Continue to check session

2. **Is there an active session?**
   - Checks for `session_token` cookie OR `session_active` marker
   - If session exists → Show dialog
   - If no session → Allow close without dialog

3. **Show confirmation dialog**
   - Sets `e.preventDefault()` and `e.returnValue = ''`
   - Stores `pending_close` flag
   - Browser shows generic "Are you sure you want to leave?" dialog

### Debug Logs to Look For

When you click the X button, you should see these logs in order:

```
🔴 beforeunload event FIRED!
🔴 beforeunload check: { isIntentionalNavigation: false, ... }
🔴 beforeunload session check: { hasCookie: true, hasSessionMarker: true, shouldShowDialog: true, ... }
⚠️ Window closing detected (beforeunload) - showing confirmation dialog
🔴 beforeunload: Dialog should appear now, returnValue set
```

**If you DON'T see these logs:**
- The `beforeunload` event is NOT firing
- This could mean:
  - Tauri is preventing the event
  - Event listener not registered properly
  - Window is closing too fast

**If you see the logs but no dialog:**
- Browser might be blocking the dialog
- Check browser console for errors
- Try in a regular browser (not Tauri) to test

### Testing the Detection

1. **Open the app and login**
2. **Open browser console** (F12)
3. **Click the X button**
4. **Check console logs:**
   - Do you see `🔴 beforeunload event FIRED!`?
   - What are the values in the session check?
   - Is `shouldShowDialog: true`?

### Common Issues

1. **Event not firing:**
   - Tauri might be closing window before event fires
   - Solution: Need Tauri-specific close handler

2. **Dialog not showing:**
   - Browser security restrictions
   - Event prevented elsewhere
   - Solution: Check if `e.preventDefault()` is being called

3. **Session not detected:**
   - Cookie not readable in Tauri
   - `session_active` marker missing
   - Solution: Check sessionStorage values

### Next Steps

After testing, share the console logs when you click X button. Look for:
- Does `beforeunload` event fire? (🔴 logs)
- What are the session check values?
- Does `shouldShowDialog` equal `true`?
- Any errors in console?

This will help identify exactly where the detection is failing.





