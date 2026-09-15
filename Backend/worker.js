require("dotenv").config();

const { database: db } = require("./services");

// Safely display booking details in HTML emails.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}

async function send(job, booking) {
  const e = process.env;

  if (job.channel === "whatsapp") {
    if (
      !e.WHATSAPP_TOKEN ||
      !e.WHATSAPP_PHONE_ID ||
      !e.WHATSAPP_OWNER_NUMBER ||
      !e.WHATSAPP_TEMPLATE ||
      !/^v\d+\.\d+$/.test(e.WHATSAPP_API_VERSION || "")
    )
      throw Error("WhatsApp configuration incomplete");

    const response = await fetch(
      `https://graph.facebook.com/${e.WHATSAPP_API_VERSION}/${e.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: e.WHATSAPP_OWNER_NUMBER,
          type: "template",
          template: {
            name: e.WHATSAPP_TEMPLATE,
            language: { code: e.WHATSAPP_LANGUAGE || "en_US" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: booking.id }],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) throw Error("WhatsApp provider rejected request");
    return;
  }

  if (!e.RESEND_API_KEY || !e.EMAIL_FROM || !e.OWNER_EMAIL)
    throw Error("Email configuration incomplete");

  const owner = job.channel === "owner_email";

  const details = [
    ["Booking reference", booking.id],
    ["Parent/adult name", booking.name],
    ["Email", booking.email],
    ["Phone", booking.phone],
    ["Learner age group", booking.age],
    ["Course", booking.course],
    ["Preferred date", booking.date],
    ["Preferred time", booking.time],
    ["Timezone", booking.timezone],
  ];

  const detailsText = details
    .map(([label, value]) => `${label}: ${value ?? ""}`)
    .join("\n");

  const detailsHtml = details
    .map(
      ([label, value]) => `
        <p style="margin:10px 0;overflow-wrap:anywhere;">
          <strong>${escapeHtml(label)}:</strong>
          ${escapeHtml(value)}
        </p>
      `,
    )
    .join("");

  // Plain-text version for email clients.
  const text = owner
    ? `🚀 New KiddoCode Demo Booking

A new free demo request has been received.

${detailsText}

Please contact the parent to confirm the demo time and share the meeting link.

Review this request in your KiddoCode dashboard.`
    : `Hi ${booking.name},

Thank you for requesting a FREE 1:1 Demo Class with KiddoCode!

We are excited to help your learner begin their programming journey.

YOUR DEMO DETAILS

${detailsText}

Our mentor will contact you shortly to confirm the final demo time and share the meeting link.

BEFORE YOUR SESSION

• Keep your laptop or desktop ready.
• Ensure you have a stable internet connection.
• Keep a notebook handy for important notes.
• Join 5–10 minutes before your confirmed session time.

We look forward to meeting you and helping your learner build amazing programming skills.

Best regards,
KiddoCode Team

Learn Programming • Build Projects • Shape Your Future
altamashraeen3@gmail.com`;

  // Owner receives a concise booking summary.
  // Parent receives a styled welcome and booking-details email.
  const html = owner
    ? `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#333;line-height:1.6;padding:24px;">
        <h2 style="color:#2563eb;">🚀 New Demo Booking</h2>

        <p>A new free demo request has been received.</p>

        ${detailsHtml}

        <p>
          Please contact the parent to confirm the demo time
          and share the meeting link.
        </p>

        <p>Review this request in your KiddoCode dashboard.</p>
      </div>
    `
    : `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7fb;padding:40px 16px;">
        <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,0.08);">

          <div style="background:#2563eb;color:white;padding:30px;text-align:center;">
            <h1 style="margin:0;">🚀 KiddoCode</h1>
            <p style="margin:10px 0 0;font-size:18px;">
              Your FREE Demo Request Is Received!
            </p>
          </div>

          <div style="padding:28px;color:#333;line-height:1.6;">

            <h2>Hi ${escapeHtml(booking.name)}, 👋</h2>

            <p>
              Thank you for requesting a
              <strong>FREE 1:1 Demo Class</strong> with
              <strong>KiddoCode</strong>.
            </p>

            <p>
              We are excited to help your learner begin
              their programming journey!
            </p>

            <div style="background:#eef4ff;border-left:5px solid #2563eb;padding:20px;margin:30px 0;border-radius:8px;">
              <h3 style="margin-top:0;">📅 Demo Details</h3>
              ${detailsHtml}
            </div>

            <p>
              Our mentor will contact you shortly to
              <strong>confirm the final demo time</strong>
              and share the meeting link.
            </p>

            <h3>📌 Before Your Session</h3>

            <ul style="padding-left:22px;">
              <li>💻 Keep your laptop or desktop ready.</li>
              <li>🌐 Ensure you have a stable internet connection.</li>
              <li>📝 Keep a notebook handy for important notes.</li>
              <li>⏰ Join 5–10 minutes before your confirmed session time.</li>
            </ul>

            <p style="margin-top:30px;">
              We look forward to meeting you and helping your learner
              build amazing programming skills.
            </p>

            <p>
              Best regards,<br>
              <strong>KiddoCode Team</strong>
            </p>

          </div>

          <div style="background:#1e293b;color:#ffffff;text-align:center;padding:20px;font-size:14px;">
            <strong>KiddoCode</strong><br>

            Learn Programming • Build Projects • Shape Your Future 🚀

            <br><br>

            <a href="mailto:altamashraeen3@gmail.com"
               style="color:#ffffff;text-decoration:underline;">
              📧 altamashraeen3@gmail.com
            </a>
          </div>

        </div>
      </div>
    `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `notification-${job.id}`,
    },
    body: JSON.stringify({
      from: e.EMAIL_FROM,
      to: owner ? e.OWNER_EMAIL : booking.email,
      subject: owner
        ? "🚀 New KiddoCode Demo Booking"
        : "🎉 Your KiddoCode Demo Request Is Received!",
      text,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw Error("Email provider rejected request");
}

async function tick() {
  const jobs = await db("rpc/claim_notifications", {
    method: "POST",
    body: {},
  });

  for (const job of jobs) {
    try {
      const [booking] = await db(
        `bookings?id=eq.${job.booking_id}&select=*`,
      );

      if (!booking) throw Error("Booking unavailable");

      await send(job, booking);

      await db(
        `notifications?id=eq.${job.id}&lease_token=eq.${job.lease_token}`,
        {
          method: "PATCH",
          body: { state: "sent", last_error: null },
        },
      );
    } catch {
      await db(
        `notifications?id=eq.${job.id}&lease_token=eq.${job.lease_token}`,
        {
          method: "PATCH",
          body: {
            state: job.attempts >= 6 ? "failed" : "pending",
            last_error: "Delivery failed; check provider/configuration.",
            available_at: new Date(
              Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000,
            ).toISOString(),
          },
        },
      );

      console.error("notification_failed", job.id);
    }
  }
}

async function loop() {
  for (;;) {
    try {
      await tick();
    } catch {
      console.error("notification_queue_unavailable");
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

if (require.main === module) {
  if (process.argv.includes("--once"))
    tick().catch(() => {
      process.exitCode = 1;
    });
  else loop();
}

module.exports = { send, tick };
