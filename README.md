# Initial Setup Approach (No Cloning)
For Phase 3, we did not clone the repository from GitHub. Instead, we reused our Phase 2 project as a foundation and built on top of it.
The Process: We duplicated our existing Phase 2 project folder locally and renamed it to cprg-phase3. This allowed us to retain all previously working functionality while continuing development without starting from scratch.
Repository Creation: A new repository named cprg-phase3 was created on GitHub.
Initial Push: After opening the duplicated project in VS Code, we initialized Git, connected the project to the new repository, and pushed the entire codebase as the initial Phase 3 commit

## Step 2 — Install dependencies
⁠ bash
npm install

## Step 3 — Start the server
⁠ bash
node server.js

We already had all of the certificates and .env file set up. 


## Key Insight
One issue we encountered during this process was that the local repository was still linked to the Phase 2 remote. As a result, initial pushes were being sent to the wrong repository.
The Fix: We updated the remote origin URL to point to the correct Phase 3 repository.
The Lesson: Git tracks repositories through remote URLs, not folder names. Even if the project folder is renamed, it will continue pushing to the previously linked repository unless explicitly changed.


# Fixing from Phase 2 Feedback
Following our Phase 2 feedback and security audit, we’ve implemented a series of critical patches to harden our backend and eliminate vulnerabilities that could be exploited in a production environment.

## Fix: Preventing Username Enumeration (The "Side Door")

Feedback Addressed: "An attacker can hit /register to confirm which usernames exist... The fix is the same generic messaging pattern you already used on login."

The Issue: While our login route was secure, our registration route previously confirmed if a username was taken. This allowed attackers to "fish" for valid usernames by trying different inputs until they hit a match.

The Fix: We updated the /register route to return a generic error: "Registration failed. Please try again." This keeps our user list private and forces an attacker to guess both the username and password blindly.

## Fix: "Fail-Loud" Environment Variable Validation

Feedback Addressed: "Consider throwing an error here and failing loudly instead so it's never possible to access your dev vars."

The Issue: If the .env file was misconfigured or missing in production, the server would still attempt to run using undefined secrets or insecure defaults.

The Fix: We added a FATAL check at the very top of server.js. The application now verifies that JWT_SECRET and SESSION_SECRET are present before initializing. If they are missing, the process logs a fatal error and shuts down immediately (process.exit(1)).

## Fix: True Session Fixation Protection

Feedback Addressed: "Your writeup claims you address session fixation... but there's no req.session.regenerate() call."

The Issue: Simply overwriting a cookie isn't enough to prevent session fixation. If a session identity isn't reset during login, an attacker could potentially "fix" a session ID on a victim's browser and hijack it once they authenticate.

The Fix: We overhauled the /login route to explicitly call res.clearCookie("token") and req.session.regenerate(). This wipes the old session and issues a brand-new, secure identity the moment the user logs in.

## Fix: Enforcing Role-Based Access Control (RBAC)

Feedback Addressed: "Your role authorization middleware isn't being used... provide a concrete permission matrix."

The Implementation: We updated the /dashboard route to explicitly require the "user" or "admin" role and created a dedicated /admin route strictly for admins.

Permission Matrix (Role → Route Access)

Route	Method	Access Level	Description
/register	POST	Public	Create a new account
/login	POST	Public	Authenticate and receive JWT
/dashboard	GET	User, Admin	General user landing page
/admin	GET	Admin Only	System status and project management
/profile	GET	User, Admin	Fetch personal account data

## 5. Admin Panel & Data Privacy

Implementation: To support our new admin-only backend route, we added a secure data endpoint to feed the admin dashboard. The new /admin route provides sensitive data like "System Status" and "Active Projects."

The Fix: We implemented a Cache-Control: no-store header on all protected routes. This prevents sensitive data from being stored in the browser's local cache, ensuring it cannot be viewed via the "Back" button after a user logs out.

## Code Integrity & Fallback Logic

Implementation: We cleaned up our environment logic to distinguish between development and production. By defining isProduction based on NODE_ENV, our cookies automatically switch to secure: true when we deploy, while allowing us to continue testing locally without SSL errors. This ensures a smooth and secure deployment pipeline.

## Fix: JWT Authentication Middleware for Protected Routes

Issue: Protected routes such as /profile, /dashboard, and /admin were configured to use authenticateJWT, but the middleware had not been properly defined. A broken route block had been placed where the authentication middleware should have been.

Risk: Without a proper JWT authentication middleware, protected routes cannot securely verify whether a user is logged in, which breaks access control and weakens backend security.

Fix Implemented: We replaced the broken route block with a dedicated authenticateJWT middleware function. This middleware now:

reads the JWT from the HTTP-only cookie
verifies the token using JWT_SECRET
attaches the decoded user information to req.user
blocks access if the token is missing, invalid, or expired

Result: All protected routes now use a valid centralized authentication layer before role-based checks are applied.

# NEW ADDITIONS FOR PHASE 3

## Step 1

1. User schema — The mongoose.Schema was updated to include three new optional fields: name, email, and bio, each defaulting to an empty string. This ensures existing accounts are not broken by the migration, while new accounts are created with the fields present from the start.

2 Registration route — The /register route was updated so that when a new user is created, the name field is pre-populated with the chosen username. The email and bio fields are initialized as empty strings, ready to be filled in through the profile form.

3 Google OAuth strategy — The Google strategy was updated to match. When a user signs in with Google for the first time and a new account is created, the name field is set from profile.displayName. Email and bio default to empty strings, consistent with the local registration flow.

4 Profile route — The GET /profile route was refactored from a simple synchronous response to an async database query. It now uses User.findById(req.user.id) to retrieve the authenticated user's full record and returns all four profile fields: username, name, email, bio, and role. A 404 is returned if the user no longer exists, and a 500 is returned on database error.

### Why this was done first
The dashboard interface and profile update form built in later steps both depend on the backend being able to store and return user-specific data. Completing this backend step first gave us a clean foundation to build on - all subsequent Phase 3 features, including secure profile updating, input validation, output encoding, and data encryption, rely on these schema fields being in place.

## Building the User Dashboard

With the backend ready to serve profile data, the next step was building the dashboard interface that users see after logging in. The goal was to move beyond a basic post-login screen and display real, user-specific information pulled securely from the server.

Fix: Back Button Session Protection
After implementing logout, we identified that the browser's back button was displaying a cached snapshot of the dashboard even after the session was destroyed.
The Fix: We added a pageshow event listener to index.html. Unlike DOMContentLoaded, pageshow fires even when the browser restores a page from its back/forward cache. On every page show, the listener makes a live request to the protected /profile route. If the JWT cookie is missing or expired, the server returns a non-OK response and the user is immediately redirected to login.html — before they can see any dashboard content.
javascriptwindow.addEventListener('pageshow', async (event) => {
  const response = await fetch('/profile');
  if (!response.ok) {
    window.location.href = '/login.html';
  }
});
This ensures that logging out fully terminates access to the dashboard through all navigation methods, including the browser back button, not just direct URL visits.

### What was built

*1. Profile data display* — The dashboard was updated to fetch the authenticated user's data from the protected ⁠ /profile ⁠ route and render it on the page. This includes the user's ⁠ username ⁠, ⁠ name ⁠, ⁠ email ⁠, and ⁠ bio ⁠, along with a personalized greeting. Because this data is loaded from the server after authentication, the page always reflects the currently logged-in user rather than any hard-coded or shared values.

*2. Logout button* — A logout option was kept visible on the dashboard so users can securely end their session at any time without navigating away.

*3. Profile update form placeholder* — A profile editing form was added to the dashboard at this stage. This was done intentionally — it satisfies the Phase 3 requirement for a profile editing area while keeping the interface ready for the secure update logic implemented in the next step.

---

### Why this matters

Loading profile data directly from the ⁠ /profile ⁠ route means the dashboard is always tied to the authenticated session. No user data is hard-coded on the client side, and the page only renders what the server returns for the logged-in user. This keeps the interface consistent with the backend authentication and access control built in Phase 2.

## Adding the Profile Update Route

After building the dashboard form, the next step was connecting it to the backend so profile changes could actually be saved. To do this, we added a protected ⁠ /update-profile ⁠ route in ⁠ server.js ⁠.

This route updates the currently authenticated user’s profile fields in the database, including name, email, and bio. Because it uses the existing authentication middleware, the route only updates the record that belongs to the logged-in user. This prevents one user from modifying another user’s profile data.

We tested to see if the profile will update and it did not only the message said "Profile updated successfully" - but the new changes actually showed up in MongoDB Compass as well. 

## CSRF Protection

Cross-Site Request Forgery (CSRF) attacks trick an authenticated user's browser into making an unintended request to the server. To prevent this, we use the csurf middleware.

CSRF protection is applied to three routes:
•⁠  ⁠POST /login
•⁠  ⁠POST /register
•⁠  ⁠POST /update-profile

On page load, the client fetches a unique token from GET /get-csrf-token and  stores it in memory. Every POST request includes this token in the CSRF-Token request header. The server validates the token before processing the request — if it is missing or incorrect, the request is rejected with a 403 error.

Because the token is tied to the user's session and changes on every page load, an attacker cannot forge a valid request from a third-party site.

## Input Validation and Sanitization

After making the profile update form functional, the next step was ensuring that it only accepts safe and expected input. Since users can submit their own data, this part was important to prevent malformed or malicious values from being stored in the database.

On the /register route, password strength is enforced before the account is created. Passwords must be at least 8 characters long, contain at least one number, and contain at least one special character. Usernames must be between  3 and 30 characters. These rules prevent weak credentials from being stored and reduce the risk of brute-force attacks succeeding against common passwords.

We implemented validation using the ⁠ express-validator ⁠ library in the ⁠ /update-profile ⁠ route. Each field was checked against strict rules based on the assignment requirements. The name field was limited to 3–50 alphabetic characters and spaces, the email field was validated using a standard email format, and the bio field was restricted to a maximum of 500 characters with only safe characters allowed.

In addition to validation, we applied sanitization to all inputs. Values were trimmed to remove unnecessary whitespace, emails were normalized into a consistent format, and escaping was applied to reduce the risk of unsafe characters being stored directly.

This ensured that only clean, expected data is accepted by the application and prevented issues such as malformed input or attempts to inject unwanted content into the system.                                                                                                             

## Output Encoding and XSS Protection

Even with validation and sanitization in place, user input can still become dangerous if it is rendered directly in the browser without proper handling. To prevent this, we ensured that all profile data displayed on the dashboard is safely handled before being inserted into the page.

Profile data (username, name, email, bio) is inserted into the DOM exclusively using element.innerText and element.textContent — never innerHTML. This means the browser always treats the value as plain text. A bio containing 
<script>alert(1)</script> is displayed literally on screen rather than executed.

The project table rows are built using document.createElement and textContent assignments for every cell. This eliminates the risk of HTML injection through data fields, since no raw string is ever passed to innerHTML.

On the server, express-validator's .escape() method encodes special characters  (< > & " ') into their HTML entity equivalents before values are stored in MongoDB. This provides a second layer of defence — even if client-side rendering were ever bypassed, the stored value itself cannot execute as HTML.

## Encryption of Sensitive Data

After implementing validation and sanitization, the next step was protecting sensitive profile data before storing it in the database. The assignment required fields such as email and bio to be secured at rest rather than being stored in plain text.

To implement this, we used Node.js’s built-in ⁠ crypto ⁠ module with the AES-256-CBC encryption algorithm. Before profile updates are saved, the email and bio values are encrypted on the server. This means that even if the database is accessed directly, the stored values are not readable in plain text.

When the profile is loaded through the protected ⁠ /profile ⁠ route, the encrypted values are decrypted before being sent back to the dashboard. This allows the user to see normal readable information in the interface while still keeping the stored data protected.

This step strengthened the privacy of user information and ensured that sensitive data is protected both in transit through HTTPS and at rest inside the database.


# Security Testing and Debugging

After implementing validation, sanitization, and safe output handling, we tested the application with a range of inputs to confirm that all security measures were working as expected.

### XSS (cross-site scripting) testing

To test XSS protection, a script payload was entered into the bio field:


<script>alert(1)</script>


The script did not execute. Instead, it was stored and displayed in encoded form:


&lt;script&gt;alert(1)&lt;&#x2F;script&gt;


This confirms the input was treated as plain text rather than executable code. The protection comes from two places: ⁠ express-validator ⁠'s ⁠ .escape() ⁠ on the backend, which encodes special characters before they are stored, and safe frontend rendering, which outputs data as text rather than raw HTML.

The project table is also built using createElement and textContent rather than innerHTML, so even if a project name contained a script tag it would render as visible text and never execute in the browser.


## SQL Injection Testing

Because this application uses MongoDB with Mongoose, it is not vulnerable to traditional SQL injection attacks. MongoDB does not use SQL — queries are built as JavaScript objects, not concatenated strings — so there is no SQL parser to inject into.

To verify this, we tested the login and registration fields with common SQL injection payloads:

•⁠  ⁠⁠ ' OR '1'='1 ⁠
•⁠  ⁠⁠ admin'-- ⁠
•⁠  ⁠⁠ "; DROP TABLE users; -- ⁠

None of these caused unexpected behaviour. Mongoose's query builder treats these strings as literal values and passes them safely to MongoDB as BSON documents. No query was manipulated.

For NoSQL injection (which is the relevant threat for MongoDB), we also tested object injection by sending malformed JSON with operator keys such as ⁠ { "$gt": "" } ⁠ in the username field. The application rejected these because express-validator sanitizes and type-checks inputs before they reach the database layer.

*Conclusion:* The combination of Mongoose's parameterized query model and express-validator input sanitization effectively prevents both SQL and NoSQL injection attacks.


### Input validation testing

Each field was tested with invalid inputs to verify the validation rules were enforced correctly.

•⁠  ⁠*Name* — inputs like "J", "J@spreet", and "12345" were rejected, confirming the field only accepts alphabetic characters within the required length.
•⁠  ⁠*Email* — formats like "abc", "test@", and "hello.com" were rejected, confirming only properly structured email addresses are accepted.
•⁠  ⁠*Bio* — inputs exceeding 500 characters were blocked before submission, confirming the character limit is enforced.

All invalid inputs were rejected before reaching the database. Error messages were returned to the client without exposing any internal details.


### Debugging during testing

During testing, we also encountered a validation error caused by an overly strict regex on the bio field. The original pattern blocked common punctuation like ⁠ ? ⁠ in natural sentences. This was caught through browser dev tools by reading the exact error message returned in the response body. The fix was to remove the unnecessary ⁠ .matches() ⁠ rule, since ⁠ .escape() ⁠ already handles sanitization. This process reinforced the value of reading exact server responses when debugging validation issues.


### Conclusion

These tests confirmed that the application correctly validates user input, sanitizes potentially harmful data, and prevents malicious scripts from executing in the browser. The combination of backend validation and safe frontend rendering ensures the system handles user input securely under different scenarios.

### Encryption Testing

To verify that sensitive data is securely stored, we tested the encryption of profile fields after updating user information.

After submitting the profile update form with valid email and bio values, we checked the database using MongoDB Compass. The email and bio fields were not stored in plain text. Instead, they appeared as encrypted strings, confirming that encryption was applied before storage.

We then refreshed the dashboard, where the same values were displayed in a readable format. This confirmed that the application correctly decrypts the data before sending it to the frontend.

This test verifies that sensitive user data is protected at rest while still remaining usable within the application.

#  Part C Third Part Dependency Management

We used the ⁠ npm audit ⁠ tool to analyze the security of third-party dependencies used in the project.

The audit identified two low severity vulnerabilities related to the ⁠ cookie ⁠ package, which is a dependency of the ⁠ csurf ⁠ library. These vulnerabilities originate from indirect dependencies rather than our own code.

We attempted to resolve issues using ⁠ npm audit fix ⁠, which addressed all fixable vulnerabilities. However, the remaining issues could not be automatically resolved without forcing major dependency changes that could break application functionality.

Since these vulnerabilities are low severity and come from a widely used library, we decided to keep the current stable version and monitor updates instead of applying unsafe fixes.

To improve long-term security, we implemented a GitHub Actions workflow that automatically runs ⁠ npm audit ⁠ on every push and pull request. This ensures that any future vulnerabilities are detected early and can be addressed safely.

The workflow file is saved at .github/workflows/audit.yml and contains the following configuration:

name: Dependency Security Audit

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 9 * * 1'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run security audit
        run: npm audit --audit-level=moderate

This runs on every push to main, every pull request, and every Monday morning automatically so new vulnerabilities are caught even when no code has changed.

# AI Tools Used

| AI Tool | Task | How We Verified |

Claude (Anthropic) | Generated HTML structure for dashboard and login page styling | Manually reviewed all generated markup, tested rendering in browser, rewrote all route-level logic ourselves |
Claude (Anthropic) | Generated GitHub Actions YAML workflow template | Read each step line by line, confirmed commands matched npm documentation, tested workflow ran successfully on push |
Claude (Anthropic) | Suggested CSS layout patterns for sidebar and profile card | Visually tested in browser, adjusted spacing and colours manually |
Claude (Anthropic) | Helped debug CSRF token fetch timing issue | Understood the async/await fix before applying it, tested with and without the fix |

All security-critical code — including JWT middleware, session regeneration, encryption/decryption functions, input validation rules, and RBAC — was written and understood by us without direct AI generation.

# Reflection Checkpoints

## Part A – Dashboard
*What challenges did you face ensuring only the logged-in user's data is displayed?*

The main challenge was making sure the dashboard never fell back to cached or stale data from a previous session. We solved this by always fetching fresh data from the protected /profile route on every page load rather than storing anything in localStorage or sessionStorage. If the JWT is missing or expired, the fetch returns a non-OK status and the user is immediately redirected to login.html. This means the dashboard is always tied to the live authenticated session and cannot display another user's data.

## Part B – Input Validation, Output Encoding, Encryption
*What types of vulnerabilities can arise from improper input validation?*

Without input validation, an attacker can submit scripts, oversized strings, or malformed data that gets stored in the database and later executed in another user's browser (stored XSS). They can also submit unexpected data types that cause server crashes or expose stack traces.In our case, accepting arbitrary characters in the bio field without length limits could allow someone to flood the database with enormous 
payloads (a form of denial of service).

*How does output encoding prevent XSS attacks?*

Even if a malicious script somehow makes it into the database, output encoding stops it from executing in the browser. By inserting data exclusively through element.innerText and element.textContent — never innerHTML — the browser treats the value as plain text. A bio containing ⁠ <script>alert(1)</script> ⁠ is displayed literally on screen as those characters. The script never enters the DOM as executable code. The server-side .escape() call from express-validator adds a second layer — encoding < > & " ' into HTML entities before storage — so the data itself is harmless even if rendering behaviour ever changed.

*What challenges did you encounter with encryption and how did you resolve them?*

The main challenge was decryption consistency. AES-256-CBC requires the same IV that was used during encryption to decrypt correctly. Our first approach stored the IV separately, which made retrieval fragile. We resolved this by prepending the IV to the encrypted string as a hex prefix separated by a colon (iv:encryptedText), so the decrypt function always has everything it needs in a single database field. We also had to handle the case where a field is empty or already unencrypted (legacy data), which we solved with a format check — if the string does not contain a colon separator, it is returned as-is.

## Part C – Dependency Management
*Why is it risky to use outdated third-party libraries?*

Outdated libraries may contain known vulnerabilities that are publicly documented in databases like the CVE registry. Once a vulnerability is published, attackers actively scan for applications still running the affected version. In our case, the csurf package depends on an older version of the cookie library with two low-severity vulnerabilities. Even though they are low severity now, severity can be reclassified as new exploit techniques emerge.

*How does automation help with dependency management? What risks does it have?*

Our GitHub Actions workflow runs npm audit on every push, every pull request, and every Monday morning. This means vulnerabilities are flagged immediately rather than discovered months later. The risk of automation is that it can create alert fatigue — if every PR triggers audit warnings that cannot be fixed without breaking changes, developers start ignoring them. Automated fixes (npm audit fix --force) can also silently introduce breaking changes by jumping major versions. Our approach mitigates this by setting --audit-level=moderate so only actionable issues trigger failures, and by reviewing release notes before applying any update manually.

## Part D – Testing and Debugging
*Which vulnerabilities were most challenging to address?*

CSRF protection was the most complex to implement correctly because it required coordination between three parts of the application: the server issuing the token, the client fetching and storing it in memory, and every protected POST request including it in the header. A timing issue where the CSRF token fetch was not completed before the user submitted a form caused intermittent 403 errors during testing. We resolved this by making getCsrf() run immediately on page load and ensuring the submit handler always reads the module-level csrfToken variable rather than fetching inline.

Session fixation was also non-trivial. Simply setting a new cookie on login was not enough — we had to call req.session.regenerate() to issue a new session identity at the infrastructure level, not just overwrite the cookie value.

*What additional testing tools or strategies could improve the process?*

OWASP ZAP (Zed Attack Proxy) would allow automated scanning of all routes for common vulnerabilities including XSS, CSRF, and injection — beyond the manual tests we ran. For automated regression testing, a tool like Supertest combined with Jest would let us write test cases that confirm validation rules and authentication guards still work after every code change. Burp Suite could be used to intercept and replay requests with modified headers to test CSRF and JWT edge cases more thoroughly.

