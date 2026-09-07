# Manual Testing Checklist

Everything on this list was verified at the HTTP/API layer during development (see `docs/ARCHITECTURE.md` for exactly what was tested and how) - **but never actually clicked through in a real browser**, because headless browser testing wasn't available in the sandbox this was built in. This checklist exists to close that specific gap. Run through it in order once, after `docker compose up --build` - each section's state carries into the next, the same way a real usage session would.

A first full pass through sections 1-10 ran in September 2026 (§21 of `docs/ARCHITECTURE.md` has the technical detail) and found 4 real bugs plus one flagged UX gap - all 5 are now fixed, but only verified against real Postgres/curl/e2e/jsdom, not yet re-confirmed by clicking through this list again. That pass wasn't recorded box-by-box against sections 1-10 specifically, so those checkboxes stay unchecked below until someone works through them individually and marks each one. **§11 is the one exception**: it's scoped specifically to re-verifying the 5 fixes from that pass, in a real browser, since - as of this writing - none of them have been.

## 1. First boot

- [ ] `docker compose up --build` - all four containers (`postgres`, `api`, `web`, `mailhog`) start without errors
  - Note: on a from-scratch build, Postgres may briefly report unhealthy (~2-3 min) while it runs a one-off WAL [write-ahead log] recovery, which can cascade into `api`/`web` sitting in `Created`. Not a bug - just re-run `docker compose up` once Postgres finishes recovering.
- [ ] http://localhost:3000/health returns `{"status":"ok",...}`
- [ ] http://localhost:3000/api/docs loads the Swagger UI and lists every endpoint
- [ ] http://localhost:3001 redirects to `/login`
- [ ] http://localhost:8025 (Mailhog) loads, inbox is empty

## 2. Register & first login

- [ ] Go to http://localhost:3001/register, create a store with a real-looking email/password/store name
- [ ] Submitting redirects to `/dashboard` automatically (no manual login needed)
- [ ] Dashboard shows the store name as the page title, "Products: 0", "Pending orders: 0", "Plan: FREE"
- [ ] Check Mailhog (http://localhost:8025) - a welcome email arrived for the address you registered
- [ ] Sign out (sidebar, bottom) - lands on `/login`
- [ ] Log back in with the same credentials - lands on `/dashboard` again
- [ ] Try logging in with the wrong password - a clear error appears, you're not logged in

## 3. Categories & Products

- [ ] Go to Categories, add two categories (e.g. "Beverages", "Snacks")
- [ ] Go to Products, click "Add product" - fill in name/price/stock/category, save
- [ ] The new product appears in the table immediately (no manual refresh needed)
- [ ] Add 2-3 more products across both categories, with varying prices and one with stock = 0
- [ ] The zero-stock product shows an "Out of stock" badge; one with stock < 5 shows a low-stock badge
- [ ] Search box: type part of a product name - the list filters as you type (after a brief pause)
- [ ] Category filter dropdown: select one category - only its products show
- [ ] Min/Max price filters: narrow the range - matches only products in that range
- [ ] Click a product's name to open the edit modal, change its price, save - the table reflects the change
- [ ] In the edit modal, upload an image (PNG/JPEG/WEBP) - a thumbnail appears in the modal and in the products table
- [ ] Try uploading a non-image file - should be rejected with a clear message
- [ ] Delete a product you don't need for later steps - confirmation prompt appears, then it's gone
- [ ] Delete a category that still has products in it - products keep their name/price but show no category afterward

## 4. Orders

- [ ] Go to Orders, click "New order"
- [ ] Add one line item (pick a product, set quantity), submit
- [ ] Order appears in the table with status "Pending" and the correct total
- [ ] Go back to Products - that product's stock decreased by the ordered quantity
- [ ] Create a second order with **two** line items
- [ ] Click the order ID to expand it - both line items show with correct quantities/prices
- [ ] On a Pending order, click "Complete" - status changes to "Completed", no stock change
- [ ] On the other Pending order, click "Cancel" - confirmation prompt, then status changes to "Cancelled"
- [ ] Check Products again - the cancelled order's items had their stock restored
- [ ] Status filter pills (All/Pending/Completed/Cancelled) - each shows only matching orders
- [ ] Try creating an order for more quantity than a product has in stock - should be rejected with a clear "insufficient stock" message, not a silent failure or crash

## 5. Staff & permissions

- [ ] Go to Staff, invite one staff member (email + temporary password)
- [ ] Sign out, log in as that staff member
- [ ] Staff sidebar does **not** show "Staff" or "Billing" links
- [ ] Staff **can** view/create Products, Categories, and Orders
- [ ] Manually navigate to http://localhost:3001/staff or `/billing` while logged in as staff - a clear "you don't have access" message appears, not a blank page or crash
- [ ] Sign out, log back in as the store owner
- [ ] Go to Staff, try inviting a **second** staff member - should be blocked with a message about the Free plan's 1-staff limit
- [ ] Remove the staff member you created - confirmation prompt, then they disappear from the list
- [ ] Confirm the removed staff member can no longer log in with their old credentials

## 6. Billing

- [ ] Go to Billing - "Free" plan is marked "Current plan"
- [ ] Click "Upgrade to Pro" - since this uses the mock payment provider by default, it should apply **instantly** with no external redirect or card entry, landing back on `/billing` with a "Plan updated" confirmation
- [ ] "Pro" now shows as the current plan
- [ ] Go back to Staff - you can now invite more than 1 staff member (Pro's limit is 10)

## 7. SuperAdmin

- [ ] Sign out. If you ran the seed script (`docker compose exec api node dist/database/seed.js`), log in as `admin@example.com` / `ChangeMe123!`. Otherwise there's no self-registration path for this role by design (see `docs/ARCHITECTURE.md` §2).
- [ ] Sidebar shows only "All stores" (no Products/Orders/Staff/Billing)
- [ ] The store you created in step 2 appears in the list, with its correct plan and "Active" status
- [ ] Click "Suspend" on that store, confirm
- [ ] In another browser tab/incognito window, try logging in as that store's owner - login should be **rejected** with a clear "store has been suspended" message
- [ ] If that store owner still has a browser tab open and logged in from earlier, refresh it - they should be logged out / blocked, not still able to use the app
- [ ] Back as SuperAdmin, click "Reactivate" on the store
- [ ] The store owner can log in again immediately

## 8. Cross-cutting checks

- [ ] Resize the browser to a narrow (mobile-ish) width on a couple of pages - layout shouldn't visibly break, though this admin panel isn't mobile-optimized
- [ ] Open browser DevTools > Network tab, reload a data-heavy page (Products or Orders) - confirm requests go to `http://localhost:3000/...` and return `200`, not CORS errors in the console
- [ ] Leave the app idle for 16+ minutes (past the 15-minute access token expiry), then click something that needs data - it should refresh the token transparently and keep working, not force a surprise logout
- [ ] Check `docker compose logs api` - requests you just made appear as structured JSON lines with a `requestId` on each
- [ ] **Verified at the HTTP layer (via curl against a real Postgres + real server, not a browser) - still needs the browser-specific check this list exists for:** after signing out, the old session is genuinely dead server-side, not just client-side. A refresh token captured before logout, replayed via `POST /auth/refresh` after logout, was confirmed to return 401 rather than a new access token. What that curl-based check *doesn't* cover: doing this through an actual browser tab, where the token lives in a cookie you'd need DevTools to inspect rather than a variable a script controls directly. Sign in, copy the `refresh_token` cookie's value from DevTools > Application > Cookies, sign out, then replay that value via Swagger UI or curl - confirm 401 the same way.

---

If something here doesn't match - that's the real, expected purpose of this checklist. Everything below the browser (migrations, RBAC, atomic stock, CORS, plan limits) was independently verified at the HTTP layer, so a failure here most likely points to something in the React layer specifically. Precisely locating that is easiest with the failing step, the browser console's error (if any), and the matching request in `docker compose logs api`.

## 9. Tenant isolation (cross-store access)

The most important section in this checklist. Every query in the API is scoped by `storeId` taken from the JWT, specifically so one store can never see another's data - but that depends on every query remembering to apply the filter, not a single central guard (see `docs/ARCHITECTURE.md` §7). This tests that assumption directly, instead of trusting it from having read the code.

You need two stores. If you only created one so far:
- [ ] Register a second store ("Store B") in a new incognito window, so Store A's session in your main window survives
- [ ] Add one product and create one order in Store B; note their IDs (visible in the URL when you open either, e.g. `/products/<id>`)
- [ ] Also note one product ID and one order ID from Store A (from §3-4)

Get Store A's access token: logged in as Store A's owner, open DevTools > Application > Cookies, copy the `access_token` value. Use it as a Bearer token in Swagger UI (the "Authorize" button at the top of http://localhost:3000/api/docs) or `curl -H "Authorization: Bearer <token>" ...`.

With **Store A's owner token**, against **Store B's IDs**:
- [ ] `GET /products/<Store B's product ID>` → `404`, not the product
- [ ] `PATCH /products/<Store B's product ID>` (any body, e.g. a price change) → `404`, price unchanged
- [ ] `DELETE /products/<Store B's product ID>` → `404`, product still exists afterward
- [ ] `GET /orders/<Store B's order ID>` → `404`, not the order

With a **Staff token** (from §5):
- [ ] `GET /billing/subscription` → `403`

With a **StoreOwner token** (not SuperAdmin):
- [ ] `PATCH /admin/stores/<any store ID>/suspend` (the same endpoint from §7) → `403`, store's status unchanged

**Any of these returning real data, or a `200`/`204` instead of `403`/`404`, is a real tenant-isolation bug.** Stop and report it rather than continuing - this is the one category of bug in this whole checklist that means a customer could see another customer's data.

## 10. Auth security checks

Not covered by clicking through the UI normally - these need Swagger UI (http://localhost:3000/api/docs) or curl.

- [ ] `POST /auth/request-password-reset` with a real registered email → `204`
- [ ] Same endpoint with a made-up email → also `204`, identical response either way (this is what makes it enumeration-safe - nothing distinguishes a real account from a fake one)
- [ ] Check Mailhog - a reset email arrived only for the real address, with a token/link
- [ ] `POST /auth/reset-password` with that token and a new password → succeeds
- [ ] Try the same token again → rejected (single-use)
- [ ] Log in with the *old* password → rejected
- [ ] Log in with the *new* password → works
- [ ] If you were logged in elsewhere (another tab) when you reset the password, that session is dead too - refresh it and confirm you're logged out (resetting revokes existing sessions)
- [ ] Any mutating request (e.g. `POST /products`) sent without the `X-CSRF-Token` header → `403`
- [ ] Same request with the header set correctly (the `csrf_token` cookie's value, copied via DevTools) → succeeds
- [ ] Call `POST /auth/refresh` more than 30 times within one minute → the calls past the 30th return `429`

## 11. Re-verifying the September 2026 bug fixes

Sections 1-10 above are the full pass - already done once, not repeated here. This section exists only to click through the 5 fixes from that pass (§21 of `docs/ARCHITECTURE.md`) for the first time in an actual browser, since all 5 were only verified against real Postgres/curl/e2e/jsdom, never clicked. Run this after `docker compose up --build` - a rebuild is required, since only the image gets rebuilt from the fixed source, not the Postgres volume, so **the store/products/staff/plan from your original full pass are still there if you didn't run `down -v`** - reuse that state where noted below rather than recreating it.

**11.1 - Category display (was: table always showed "-")**

This is a read-path fix, not a write-path one - any product that already has a category assigned, created before this fix, should now display it correctly with no new data needed.

- [ ] Go to Products - any existing product with a category assigned (from §3) now shows that category's name, not "-"
- [ ] If none of your existing products have a category, assign one to any product via the edit modal, save, and confirm the table shows the name immediately
- [ ] Open that same product's edit modal again - the category dropdown is pre-selected to the correct one (this exercises the same relation load as the table)

**11.2 - Product image thumbnails (was: broken icon, DevTools showed a blocked cross-origin request)**

- [ ] Go to Products - any existing product with an uploaded image (from §3) now shows its thumbnail, not a broken-image icon
- [ ] Open DevTools > Network, reload the page, find the request to `/uploads/<filename>` - status `200`, and check Response Headers for `cross-origin-resource-policy: cross-origin` (this is the specific header that was wrong; confirming it's now set is more precise than just "the image loaded", which could pass for the wrong reason if the browser cached the broken state - hard-refresh with cache disabled if unsure)
- [ ] Opening that same `/uploads/<filename>` URL directly in a new tab still works (this was never broken, only cross-origin embedding was - if this regressed, that's a new, different bug)

**11.3 - Downgrade doesn't enforce the staff limit (two separate layers to check)**

*Layer 1 - blocked at the moment of downgrade, while still a live request:*
- [ ] If not already on Pro with 2+ staff from your original pass (§6), do so now: Billing → Upgrade to Pro, then Staff → invite one more (Free's limit is 1, Pro's is 10)
- [ ] Billing → Downgrade to Free → **blocked**, with a message naming the actual staff count and the Free plan's limit (not a generic error)
- [ ] Billing page still shows "Pro" as the current plan afterward - the downgrade didn't partially apply

*Layer 2 - defends against a downgrade that already happened somewhere the app couldn't intercept (in production: a Stripe webhook). The mock payment provider used by default has no such path, so there's no pure-UI way to reach this - it needs one direct SQL write to simulate what that webhook would have done:*
- [ ] `docker compose exec postgres psql -U postgres -d store_saas -c "UPDATE subscriptions SET plan = 'FREE' WHERE store_id = (SELECT id FROM stores WHERE name = '<your store name>');"`
- [ ] Sign out, log in as the **second staff member** you invited above → **rejected**, with a message about the store being over its plan's staff limit
- [ ] Log in as the **store owner** instead → still works (the owner is deliberately exempt, so they can always get in to fix billing or remove staff)
- [ ] `docker compose exec postgres psql -U postgres -d store_saas -c "UPDATE subscriptions SET plan = 'PRO' WHERE store_id = (SELECT id FROM stores WHERE name = '<your store name>');"` to undo the simulated webhook and leave billing state consistent with what the UI shows

**11.4 - Uploaded files lost on container restart**

- [ ] Confirm you have at least one product with an uploaded image (from §3 or 11.2 above)
- [ ] `docker compose down` (**no** `-v` - that flag tests something else, whether the Postgres volume survives, which was never the bug)
- [ ] `docker compose up` (no `--build` needed here - same image, just recreating the container, which is exactly what previously wiped `/repo/apps/api/uploads`)
- [ ] Go back to that product - thumbnail still loads, and the direct `/uploads/<filename>` URL still resolves too

**11.5 - No password show/hide toggle**

- [ ] Login page - an eye icon appears at the right edge of the password field; clicking it reveals the typed password as plain text, clicking again re-hides it
- [ ] Register page - same, on its password field
- [ ] Trigger a password reset (§10) and open the reset-password page - same, on **both** password fields (new password + confirm)
- [ ] Staff → invite a staff member - same, on the temporary-password field
- [ ] On any of the above, confirm the toggle doesn't affect the email/name fields next to it - only password-type fields grew a button
