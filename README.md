# CPRG PHASE 2

Fixings Phase 1 based on Ashlyn's Feedback: 

- SSL Safety: Implemented file existence checks for certificates to prevent unhandled server crashes during startup.
- Helmet Consolidation: Merged CSP directives into a single Helmet initialization for better middleware efficiency.
- CSP Hardening: Removed 'unsafe-inline' from stylesheets to mitigate XSS risks. 
- Static Asset Caching: Configured express.static with setHeaders to enforce a 24-hour cache policy for CSS files, aligning code with project documentation.
--------------------------------------------

Phase 2: Authentication & Authorization

Part A: Designing a Secure Authentication System
Our approach to authentication prioritizes data integrity and resistance to common web vulnerabilities. We chose 'Local Authentication' combined with 'password hashing' to protect user credentials.

- Password Hashing: We implemented `bcryptjs` to hash passwords before storage. This ensures that even if the server data is compromised, raw passwords are never exposed. 
-  Salt Factor: We used a cost factor of 10 to balance security (making it computationally expensive for hackers to brute-force) and performance (ensuring a fast experience for legitimate users).
-  User Storage: Users are currently managed in a server-side array (`users[]`), which stores unique IDs, usernames, hashed passwords, and assigned roles.