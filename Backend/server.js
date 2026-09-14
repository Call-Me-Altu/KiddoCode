require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { createHash } = require("node:crypto");
const { validateBooking } = require("./validation");
const { database, verifyUser } = require("./services");

function createApp({ db = database, authenticate = verifyUser } = {}) {
  const app = express();
  if (process.env.TRUST_PROXY_HOPS)
    app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "connect-src": ["'self'", "https://*.supabase.co"],
          "script-src": ["'self'"],
          "upgrade-insecure-requests": null,
        },
      },
    }),
  );
  const origins = (
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3001,https://kiddcode.netlify.app"
  ).split(",");
  app.use(
    cors({
      origin: origins,
      methods: ["GET", "POST", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    }),
  );
  app.use(express.json({ limit: "12kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/config", (req, res) =>
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseKey: process.env.SUPABASE_ANON_KEY || "",
    }),
  );
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
  });
  app.post(["/api/bookings", "/send-demo"], limiter, async (req, res) => {
    const key = req.get("Idempotency-Key");
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        key || "",
      )
    )
      return res
        .status(400)
        .json({ message: "A valid request ID is required." });
    let data;
    try {
      data = validateBooking(req.body);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    try {
      const booking = await db("rpc/save_booking", {
        method: "POST",
        body: {
          p_key: key,
          p_fingerprint: fingerprint,
          p_data: data,
          p_whatsapp: process.env.WHATSAPP_ENABLED === "true",
        },
      });
      res.status(201).json({
        success: true,
        id: booking,
        message:
          "Your demo request is saved. We will contact you to confirm a time.",
      });
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({
          message:
            "This request ID was used with different details. Reload and try again.",
        });
      console.error("booking_save_failed", e.code || "unavailable");
      res.status(503).json({
        message:
          "We could not confirm your booking. Your details are still here; please retry.",
      });
    }
  });
  app.use(
    "/api/account",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { message: "Please wait a moment before retrying." },
    }),
  );
  app.use("/api/account", async (req, res, next) => {
    try {
      req.user = await authenticate(req.get("Authorization"));
      if (!req.user.email_confirmed_at) throw Error();
      next();
    } catch {
      res
        .status(401)
        .json({ message: "Please sign in with a verified email address." });
    }
  });
  const isAdmin = (user) =>
    (process.env.ADMIN_USER_IDS || "").split(",").includes(user.id);
  app.get("/api/account/bookings", async (req, res) => {
    try {
      const admin = isAdmin(req.user);
      const page = Math.max(
        0,
        Math.min(100000, parseInt(req.query.page, 10) || 0),
      );
      const filter = admin
        ? ""
        : "&email=eq." + encodeURIComponent(req.user.email.toLowerCase());
      const rows = await db(
        `bookings?select=id,name,email,phone,age,course,date,time,timezone,status,created_at&order=created_at.desc&limit=51&offset=${page * 50}${filter}`,
      );
      res.json({
        admin,
        email: req.user.email,
        rows: rows.slice(0, 50),
        hasMore: rows.length > 50,
      });
    } catch {
      res
        .status(503)
        .json({ message: "Unable to load bookings. Please retry." });
    }
  });
  app.patch("/api/account/bookings/:id", async (req, res) => {
    if (!isAdmin(req.user))
      return res.status(403).json({ message: "Admin access required." });
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        req.params.id,
      ) ||
      ![
        "New",
        "Contacted",
        "Demo Booked",
        "Converted",
        "Not Interested",
      ].includes(req.body.status)
    )
      return res.status(400).json({ message: "Invalid booking or status." });
    try {
      const rows = await db(`bookings?id=eq.${req.params.id}`, {
        method: "PATCH",
        body: { status: req.body.status },
        headers: { Prefer: "return=representation" },
      });
      if (!rows.length)
        return res.status(404).json({ message: "Booking not found." });
      res.json({ success: true });
    } catch {
      res.status(503).json({ message: "Status was not saved. Please retry." });
    }
  });
  app.use(
    express.static(require("node:path").join(__dirname, "public"), {
      extensions: ["html"],
    }),
  );
  app.use((err, req, res, next) =>
    res
      .status(err.status === 413 ? 413 : 400)
      .json({ message: "Invalid request." }),
  );
  return app;
}
if (require.main === module)
  createApp().listen(process.env.PORT || 3001, () =>
    console.log("KiddoCode listening"),
  );
module.exports = { createApp };
