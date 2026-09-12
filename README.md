# KiddoCode — website upgrade

A lightweight, responsive website for converting free coding demos into course enquiries. Includes a redesigned frontend, database-backed booking API, durable notification worker, adult/parent authentication and a protected lead dashboard.

## Start here

This is a source-code handoff, not a live deployment. Your original Netlify site has not been changed. The pages can be previewed locally; real bookings, accounts and notifications need the configuration below.

1. Extract the ZIP. Run `npm ci` in the `kiddocode` folder using Node 22 or newer.
2. Copy `.env.example` to `.env` and add your own service values locally. Never upload the real file or paste secrets into chat.
3. Run `npm start` and visit http://localhost:3001.
4. After creating your database and configuring email, run `npm run worker` in a second terminal. Keep it running.

Do not simply double-click the HTML files: account and booking requests need the API.

## What changed

- Warm editorial design, CSS project artwork, responsive navigation, hover effects, keyboard focus, labelled forms and reduced-motion support.
- No external fonts, image downloads, frontend frameworks, tracking scripts or missing image dependencies.
- All six original coding courses retained, with course-to-booking prefill.
- Home, About and Privacy rewritten; FAQ, project ideas, learning journey and mentor sections added.
- Unverified ratings, student counts, testimonials and third-party-employer claims removed. Mentor names and teaching areas come from your original site; verify their publication permission and availability.
- Original prices and fixed hour counts are replaced with “discuss after demo”; restore them only after checking current offers.
- Login, signup, email confirmation, forgot password, reset password, logout and a booking dashboard.
- Guest booking stays available; login is never required for a free demo.
- Booking + notification jobs saved in one database transaction. Success is shown only after the save completes, not after sending emails.
- Retry IDs and payload fingerprints prevent a repeated request in the same browser tab from creating duplicate leads.
- Server validation, request-size limits, rate limits, no raw booking logs, protected tables and server-verified account access.
- Owner and parent email jobs retry independently. Optional automated WhatsApp owner alerts are queued separately.

## 1. Supabase database and accounts

Create a Supabase project in a region appropriate for your customers and backend. In its SQL Editor, run `schema.sql` once in a fresh project. Do not rerun it over an existing installation without a reviewed migration.

The two tables are `bookings` and `notifications`. Row-level security is enabled and access is revoked from both anonymous and authenticated browser roles. Only the backend's service-role key can read/write them. The API independently verifies the logged-in user through Supabase Auth before returning records.

Put these values in your backend environment:

- `SUPABASE_URL`: project URL.
- `SUPABASE_ANON_KEY`: public anon key. This is intentionally returned by /api/config for browser authentication.
- `SUPABASE_SERVICE_ROLE_KEY`: secret service-role key. Backend and worker only.

In Supabase Authentication:

1. Enable email/password sign-in and **require email confirmation**.
2. Set the Site URL to your actual frontend URL.
3. Allow exact redirect URLs: `https://kiddcode.netlify.app/dashboard.html` and `https://kiddcode.netlify.app/reset.html`. Add localhost equivalents for local testing; add your custom domain when you use it.
4. Configure production SMTP for confirmation and recovery emails. Supabase Auth emails are separate from the booking emails sent by the worker.
5. Configure strong password requirements (the form requires 12+ characters), sensible email/auth rate limits and suitable anti-abuse controls.
6. Test signup confirmation, login, recovery and logout using a real staging address.

Accounts are for adults/parents, not unsupervised child signups. Bookings are matched to a **verified email address**. Anyone sharing the same mailbox can access those requests, so use a private parent email. The frontend stores sessions in sessionStorage; closing the tab normally ends local persistence. No password is stored by this application.

For admins: create and verify your own account, copy its UUID from Supabase Authentication → Users, and place it in `ADMIN_USER_IDS` on the backend. Multiple IDs are comma-separated. Never assign admin permission through editable user metadata. Admins use the same dashboard.html page and can view, search/filter the current page of leads, paginate, call parents and update status.

## 2. Deploy the API on Render

Keep your existing backend service if appropriate. Set its root directory to the folder containing server.js and package.json.

- Runtime: Node, version 22 or newer.
- Build: `npm ci`
- Start: `npm start`
- Health check: `/api/health`
- Environment: values from .env.example.

`ALLOWED_ORIGINS` should list your real frontend origins. The frontend uses a same-origin /api path proxied by Netlify.

**Proxy/rate-limit configuration matters:** determine the actual trusted proxy chain in your deployment before setting `TRUST_PROXY_HOPS`. Do not set unrestricted trust. Incorrect proxy settings can group all customers under one limit or let clients spoof their address. Confirm isolation by testing separate client IPs through Netlify and directly to Render. The included limiter uses process memory and is intended for a single API instance; use a shared rate-limit store before horizontal scaling.

An always-on Render instance avoids its free-tier idle wake-up delay. Do not buy a larger plan simply because there are multiple providers: first compare warm and idle request timings. Keeping Netlify + Render + Supabase + Resend is supported by this implementation.

## 3. Deploy notifications separately

Create a continuously running background worker from the same code with `npm ci` as build command and `npm run worker` as start command. It needs the same database service key plus email and optional WhatsApp settings.

Alternatively, a scheduler can run `npm run worker:once`; each run handles up to five jobs. Provision enough frequency/capacity. A web service that spins down does not guarantee timely background delivery.

Jobs are stored durably, claimed with row locking, and leased for five minutes. Interrupted jobs become available again. Six attempts are allowed with increasing delays; exhausted jobs are marked failed. The lease token prevents an old worker from updating a newly claimed job.

Monitor failed/stuck jobs in the Supabase notifications table and worker logs. Correct configuration/provider errors before manually requeuing a failed job by setting state=pending, attempts=0 and available_at=now(). Manual retries may duplicate messages, particularly after an ambiguous provider timeout.

Resend requests use a stable idempotency key. Resend's key retention window is limited; manual retries beyond that window can duplicate emails. WhatsApp does not have the same application-level idempotency guarantee, so an ambiguous timeout can duplicate a WhatsApp alert.

Here, state=sent means the provider **accepted** the API request, not that the email/message reached an inbox. Provider delivery/bounce webhooks and a dedicated notification-health dashboard are future improvements.

## 4. Configure Resend

Verify a domain with Resend and set its DNS records. Use a sender on that domain in EMAIL_FROM, such as `KiddoCode <hello@your-domain.com>`. Add RESEND_API_KEY and OWNER_EMAIL.

Do not use onboarding@resend.dev as the production sender to arbitrary parents. Check both owner and parent delivery in staging. The parent message says the request was received, not that an appointment is confirmed.

## 5. WhatsApp: two separate features

**Available without API setup:** the footer/contact links and post-booking button open your original number, +91 8077481604. The parent must choose to send the message. The prefilled text includes only a booking reference.

**Optional automated owner alert:** the worker implements a Meta WhatsApp Cloud API template message to a configured owner number. This is disabled by default. It is not a parent broadcast system.

To enable it:

1. Set up an eligible WhatsApp Business account and Cloud API sender.
2. Obtain an appropriate access token and sender phone-number ID.
3. Use a supported Graph API version from your Meta app dashboard.
4. Get approval for a suitable template with exactly **one body text parameter**: the booking reference. Suggested content: “A new KiddoCode demo request has been received. Reference: {{1}}. Sign in to the KiddoCode lead dashboard to review it.”
5. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_OWNER_NUMBER, WHATSAPP_TEMPLATE, WHATSAPP_LANGUAGE and WHATSAPP_API_VERSION.
6. Confirm the owner recipient has opted in, check current provider rules/costs, then set WHATSAPP_ENABLED=true on the API and test.

Full parent details are deliberately not sent in the automated WhatsApp alert. Sign in to the dashboard to see them. Existing bookings made while WhatsApp was disabled do not automatically gain a WhatsApp job.

## 6. Deploy the frontend on Netlify

Deploy the **project root** through your repository so Netlify reads netlify.toml. Set the publish directory to `public`; no frontend build command is required.

The API proxy in netlify.toml points to your original `https://kiddocode.onrender.com`. Change it if your backend URL differs. A plain drag-and-drop of public/ without the root routing config will not configure this API proxy.

Never publish the entire project root, .env, schema.sql, server modules or node_modules as static files.

The clean /about and /privacy paths rely on Netlify's HTML handling; all internal links use explicit .html files for portability. The old courses, mentors and demo anchors are retained. The old testimonials section is replaced with clearly labelled project ideas.

The included CSP only allows this site's scripts and Supabase connections. If you use a custom Supabase domain, update connect-src in both netlify.toml and server.js. Do not weaken the policy to allow arbitrary scripts.

## Launch checklist

- Run the tests; preview phone, tablet and desktop layouts.
- Verify branding: the supplied logo/photos were absent, so this version uses a text wordmark and CSS illustrations.
- Verify mentor names, teaching areas, course descriptions, contact email/phone and actual demo offering.
- Review the privacy text against your real business practices and applicable requirements with qualified counsel. Choose and document a concrete retention period, deletion process and backup handling before launch. This text is a draft, not a compliance certification.
- Confirm the public anon key cannot read either database table or invoke the service functions.
- Create two parent accounts and verify they cannot see each other's bookings; confirm admin access separately.
- Submit a real staging request; confirm one saved record, independent emails, and (if enabled) owner WhatsApp notification.
- Retry a timed-out request with unchanged details; verify no duplicate booking.
- Stop/restart the worker with a pending job; verify recovery.
- Test password reset links, including expired links and a fresh browser.
- Verify the proxy, rate limiting, custom domain/DNS and email sender.
- Monitor API failures, queue backlog, failed jobs and delivery/bounce events after launch.

## Tests and scope

`npm test` runs mocked HTTP/auth/provider tests and validation checks.

`test/database.cjs` can run against PGlite (PostgreSQL compiled to WASM) after installing it as a local QA dependency. It exercises the actual schema, retry behavior, leases and database permissions.

`test/browser.cjs` uses Playwright with a local running server. Optional QA dependencies are not included in production dependencies. See TEST-REPORT.md for the checks actually completed in this handoff.

No payments, course content delivery, student progress, class schedules, certificates or live calendar reservations are claimed here. The current dashboard is a working **demo-request dashboard**. Those additional features should be built after your enrolment workflow is settled.

Preferred date/time remains a wall-clock preference plus an IANA timezone. It is not converted into a reserved slot; staff must confirm availability and DST ambiguities.

## Files

- public/: eight HTML pages, shared CSS/JS, account logic and favicon.
- server.js, validation.js, services.js: API and authorization.
- worker.js: notification processing.
- schema.sql: tables and atomic database functions.
- netlify.toml: frontend publish directory, security headers and API proxy.
- .env.example: configuration names only.
- test/: automated checks.

## Provider references

- [Render free-service limitations](https://render.com/docs/free)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

Provider pricing, WhatsApp approvals and paid deployments remain your decisions. No services have been purchased or live messages sent.
