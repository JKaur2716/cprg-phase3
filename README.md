# Initial Setup Approach (No Cloning)
For Phase 3, we did not clone the repository from GitHub. Instead, we reused our Phase 2 project as a foundation and built on top of it.
The Process: We duplicated our existing Phase 2 project folder locally and renamed it to cprg-phase3. This allowed us to retain all previously working functionality while continuing development without starting from scratch.
Repository Creation: A new repository named cprg-phase3 was created on GitHub.
Initial Push: After opening the duplicated project in VS Code, we initialized Git, connected the project to the new repository, and pushed the entire codebase as the initial Phase 3 commit.
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

