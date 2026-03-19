const express = require("express"); 
const https = require("https");
const fs = require("fs");
const helmet = require("helmet");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const csrf = require("csurf");

const app = express();

// SSL Configuration
const keyPath = path.join(__dirname, "cert/server.key");
const certPath = path.join(__dirname, "cert/server.cert");

// Basic check so the server doesn't crash if certs are missing
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error("ERROR: SSL Certificates not found in /cert folder!");
    process.exit(1);
}

const sslOptions = { 
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

//Security Middleware

//Brute force protection for the login route
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, // Limit each IP to 5 attempts
    message: "Too many login attempts. Please try again in 15 minutes."
});

// CSRF Protection Initialization
const csrfProtection = csrf({ cookie: true });

app.use(helmet()); 
app.use(express.json()); // Essential for reading JSON bodies
app.use(cookieParser()); // Required for CSRF and JWT cookies
app.use(csrfProtection); // Apply CSRF protection globally

// Handing out the CSRF token for the frontend to use
app.get("/get-csrf-token", (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

//static file catching for css
app.use(express.static("public", {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.set("Cache-Control", "public, max-age=86400");
        }
    }
}));

// Phase 2: Part B - Authentication & Role-Based Access Middleware

//1. Checking if the user is logged in
const authenticateJWT = (req, res, next) => {
    const token = req.cookies.token; //For login cookies

    if (!token) {
        return res.status(401).json({ error: "Access denied. Please login first"});
    }

    try {
        //Verify the token using our secret key
        const verified = jwt.verify(token, "super-secret-key");
        req.user = verified; 
        next(); 
    } catch (error) {
        res.status(403).json({ error: "Invalid or expired token."}); 
    }
};

// 2. Role checking (Admin vs User)
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({error: `Access denied. ${roles} permission required.`});
        }
    next();
  };
};

// Phase 2: Mock User Database
const users = []; 
const feedback = [
{
    id:1,
    project: "Website redesign",
    client: "Client A", 
    freelancer: "Designer B", 
    comment: "Please improve spacing on Homepage", 
    status: "open"
}, 
{
    id: 2, 
    project: "Mobile app UI", 
    client: "Client K", 
    freelancer: "Designer J", 
    comment: "Those colors look great now", 
    status: "resolved"
}]; 

//cache enabling for public feedbacks

app.get("/feedback", (req, res) => {
    res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=120");
    res.json(feedback);
})

// Create Feedback (No Caching Sensitive)

app.post("/login", loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = users.find(u => u.username === username);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // SESSION FIXATION MITIGATION: 
        // We clear any existing token before issuing a fresh one upon login.
        res.clearCookie("token");

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            "super-secret-key", // In production, use process.env.JWT_SECRET
            { expiresIn: "1h" }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "Strict",
            maxAge: 3600000
        });

        res.json({ message: "Login successful!", role: user.role });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Accessible to ANY authenticated user
app.get("/profile", authenticateJWT, (req, res) => { 
    res.set("cache-control", "no-store, private");
    res.json({
        message: "Welcome to your profile",
        user: req.user.username,
        role: req.user.role
    });
});

// Accessible ONLY to Admins
app.get("/dashboard", authenticateJWT, authorizeRoles("admin"), (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json({
        activeProjects: 3,
        unreadFeedback: 5,
        adminMessage: "System status: Healthy"
    });
});

// Phase 2: User Registration --
app.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Checking existing users
        const existingUser = users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ error: "User already exists"});
        }

        // 2. Hashing the password (Security: Salt rounds = 10)
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Save user with a default 'user' role
        const newUser = {
            id: users.length + 1,
            username,
            password: hashedPassword, 
            // BACKDOOR: If we register as 'Jaspreet', we get Admin rights automatically
            role: username === "Jaspreet" ? "admin" : "user"
        };
        users.push(newUser);

        res.status(201).json({message: "User registered successfully!"})
        } catch (error) {
            res.status(500).json({error: "Internal server error"});
        }
});


// Phase 2: Part E - Logout 
app.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
});


// Google SSO Placeholder Route (because we can't get the real one yet)
app.get("/auth/google", (req, res) => {
    //Google handshake
    res.send("Redirecting to Google SSO... (Mocked for Phase 2)");
});

// Phase 2: Part C = Token Refresh System
app.post("/refresh-token", authenticateJWT, (req, res) => {
    const newToken = jwt.sign(
        {id: req.user.id, username: req.user.username, role: req.user.role}, 
        "super-secret-key",
        {expiresIn: "1h"}
    );

    res.cookie("token", newToken, {
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        maxAge: 3600000
    });
    
    res.json({message: "token refreshed successfully!"});
});


//Start Secure HTTPS Server

https.createServer(sslOptions, app).listen(3000, () => {
    console.log("Secure server running at:");
    console.log("https://localhost:3000");
});
