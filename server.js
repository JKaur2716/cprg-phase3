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
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { body, validationResult } = require("express-validator");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const algorithm = "aes-256-cbc";
const secretKey = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_KEY || "phase3_default_secret_key")
  .digest();
const ivLength = 16;

function encrypt(text) {
  if (!text) return "";

  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  if (!text) return "";

  const parts = text.split(":");
  if (parts.length !== 2) return text;

  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];

  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}


if (!process.env.JWT_SECRET || !process.env.SESSION_SECRET) {
  console.error("FATAL: Missing required environment variables. Check your .env file.");
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";
const cookieSecure = isProduction;

// MongoDB
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/revisalDB")
  .then(() => console.log("Connected to MongoDB..."))
  .catch((err) => console.error("Could not connect to MongoDB:", err));

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },

  name: { type: String, default: "" },

  email: { type: String, default: "" },

  bio: { type: String, default: "" },

  password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
  },

  role: { type: String, enum: ["user", "admin"], default: "user" },

  googleId: { type: String },
});

const User = mongoose.model("User", userSchema);

// SSL
const keyPath = path.join(__dirname, "cert/server.key");
const certPath = path.join(__dirname, "cert/server.cert");

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error("ERROR: SSL Certificates not found in /cert folder!");
  process.exit(1);
}

const sslOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

// Middleware

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: cookieSecure,
      httpOnly: true,
      sameSite: isProduction ? "strict" : "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Passport
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "https://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = new User({
  username: profile.displayName,
  name: profile.displayName || "",
  email: "",
  bio: "",
  googleId: profile.id,
  role: "user",
});
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// CSRF
const csrfProtection = csrf({ cookie: true });

app.use("/login", csrfProtection);
app.use("/register", csrfProtection);

app.get("/get-csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Static files
app.use(
  express.static("public", {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".css")) {
        res.set("Cache-Control", "public, max-age=86400");
      }
    },
  })
);

// Rate limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

// Auth middleware

const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Access denied. Please login first." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }
};


const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: `Access denied. ${roles.join(", ")} role required.` });
    }

    next();
  };
};

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id ? user._id.toString() : user.id,
      username: user.username,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: 3600000,
  });
};

// Register
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
    return res.status(400).json({ error: "Registration failed. Please try again." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
  username,
  name: username,
  email: "",
  bio: "",
  password: hashedPassword,
  role: "user",
});

    await newUser.save();
    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Registration error" });
  }
});



// Login

app.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await User.findOne({ username });

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // ✅ clear old token
    res.clearCookie("token", {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? "strict" : "lax",
    });

    // ✅ regenerate session
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: "Session regeneration failed" });
      }

      const token = signToken(user);
      setTokenCookie(res, token);

      res.json({ message: "Login successful!", role: user.role });
    });

  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Google OAuth
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login.html" }),
  (req, res) => {
    try {
      const token = signToken(req.user);
      setTokenCookie(res, token);
      res.redirect("/index.html");
    } catch (error) {
      res.redirect("/login.html");
    }
  }
);

// Profile
app.get("/profile", authenticateJWT, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const currentUser = await User.findById(req.user.id).select("username name email bio role");

    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }

  res.json({
  user: currentUser.username,
  name: currentUser.name,
  email: currentUser.email ? decrypt(currentUser.email) : "",
  bio: currentUser.bio ? decrypt(currentUser.bio) : "",
  role: currentUser.role,
  });

  } catch (error) {
    res.status(500).json({ error: "Failed to load profile." });
  }
});

app.post(
  "/update-profile",
  authenticateJWT,
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required.")
      .isLength({ min: 3, max: 50 })
      .withMessage("Name must be between 3 and 50 characters.")
      .matches(/^[A-Za-z\s]+$/)
      .withMessage("Name can only contain alphabetic characters and spaces.")
      .escape(),

    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required.")
      .isEmail()
      .withMessage("Please enter a valid email address.")
      .normalizeEmail(),

    body("bio")
      .trim()
      .notEmpty()
      .withMessage("Bio is required.")
      .isLength({ max: 500 })
      .withMessage("Bio must not exceed 500 characters.")
      .escape(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: errors.array()[0].msg,
        });
      }

      const { name, email, bio } = req.body;
      const encryptedEmail = encrypt(email);
      const encryptedBio = encrypt(bio);

      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        { name, email: encryptedEmail, bio: encryptedBio },
        { new: true }
      ).select("username name email bio role");

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found." });
      }

      res.set("Cache-Control", "no-store");

      res.json({
        message: "Profile updated successfully.",
        user: {
          username: updatedUser.username,
          name: updatedUser.name,
          email: updatedUser.email,
          bio: updatedUser.bio,
          role: updatedUser.role,
        },
      });
    } catch (error) {
      console.error("Update Profile Error:", error);
      res.status(500).json({ error: "Failed to update profile." });
    }
  }
);

// Dashboard
app.get("/dashboard", authenticateJWT, authorizeRoles("user", "admin"), (req, res) => {
  res.set("Cache-Control", "no-store");

  const baseData = {
    message: `Welcome, ${req.user.username}!`,
    role: req.user.role,
  };

  if (req.user.role === "admin") {
    return res.json({
      ...baseData,
      adminMessage: "System status: Healthy",
      dashboardData: "All good",
      activeProjects: 3,
      unreadFeedback: 5,
    });
  }

  return res.json({
    ...baseData,
    yourProjects: 1,
    notifications: "No new notifications.",
    tip: "Contact an admin if you need more access.",
  });
});

// Admin
app.get("/admin", authenticateJWT, authorizeRoles("admin"), (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    message: "Welcome to the Admin panel!",
    systemStatus: "Healthy",
    activeProjects: 3,
    unreadFeedback: 5,
  });
});

// Logout
app.get("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: isProduction ? "strict" : "lax",
  });

  req.logout(() => {
    req.session.destroy(() => {
      res.redirect("/login.html");
    });
  });
});

// Refresh
app.post("/refresh-token", authenticateJWT, (req, res) => {
  const newToken = jwt.sign(
    {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  setTokenCookie(res, newToken);
  res.json({ message: "Token refreshed successfully!" });
});

https.createServer(sslOptions, app).listen(3000, () => {
  console.log("Secure server running at https://localhost:3000");
});