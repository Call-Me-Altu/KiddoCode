require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");

const app = express();

const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(helmet());

app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
}));

app.use(express.json());

// Rate Limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    }
});

app.use(limiter);

// Test Route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "KiddoCode Backend is running 🚀"
    });
});

// Temporary Route
app.post("/send-demo", async (req, res) => {
    try {

        const {
            name,
            email,
            phone,
            course,
            timezone,
            date,
            time
        } = req.body;

        console.log("Received Data:", req.body);

        // Email to you
        await resend.emails.send({
            from: "KiddoCode <onboarding@resend.dev>",
            to: process.env.OWNER_EMAIL,
            subject: "🚀 New Demo Booking",
            html: `
                <h2>New Demo Booking</h2>

                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Course:</strong> ${course}</p>
                <p><strong>Timezone:</strong> ${timezone}</p>
                <p><strong>Date:</strong> ${date}</p>
                <p><strong>Time:</strong> ${time}</p>
            `
        });

        // Confirmation email to user
await resend.emails.send({
    from: "KiddoCode <onboarding@resend.dev>",
    to: email,
    subject: "🎉 Your KiddoCode Demo Class is Confirmed!",

    html: `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f7fb; padding:40px 20px;">
        <div style="max-width:650px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.08);">

            <div style="background:#2563eb; color:white; padding:30px; text-align:center;">
                <h1 style="margin:0;">🚀 KiddoCode</h1>
                <p style="margin-top:10px; font-size:18px;">
                    Your FREE Demo Class is Confirmed!
                </p>
            </div>

            <div style="padding:35px; color:#333;">

                <h2>Hi ${name}, 👋</h2>

                <p>
                    Thank you for booking a <strong>FREE 1:1 Demo Class</strong> with
                    <strong>KiddoCode</strong>.
                </p>

                <p>
                    We are excited to help you begin your programming journey!
                </p>

                <div style="background:#eef4ff; border-left:5px solid #2563eb; padding:20px; margin:30px 0; border-radius:8px;">

                    <h3 style="margin-top:0;">📅 Demo Details</h3>

                    <p><strong>Course:</strong> ${course}</p>

                    <p><strong>Date:</strong> ${date}</p>

                    <p><strong>Time:</strong> ${time}</p>

                    <p><strong>Time Zone:</strong> ${timezone}</p>

                </div>

                <h3>📌 Before Your Session</h3>

                <ul>
                    <li>💻 Keep your laptop or desktop ready.</li>
                    <li>🌐 Ensure you have a stable internet connection.</li>
                    <li>📝 Keep a notebook handy for important notes.</li>
                    <li>⏰ Please join 5–10 minutes before your scheduled time.</li>
                </ul>

                <p>
                    Our mentor will contact you shortly with the meeting link and any additional details.
                </p>

                <p style="margin-top:30px;">
                    We look forward to meeting you and helping you build amazing programming skills.
                </p>

                <p>
                    Best Regards,<br>
                    <strong>KiddoCode Team</strong>
                </p>

            </div>

            <div style="background:#1e293b; color:#ffffff; text-align:center; padding:20px; font-size:14px;">

                <strong>KiddoCode</strong><br>

                Learn Programming • Build Projects • Shape Your Future 🚀

                <br><br>

                📧 altamashraeen3@gmail.com

            </div>

        </div>
    </div>
    `
});

        res.json({
            success: true,
            message: "Demo booked successfully."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to send email."
        });

    }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
