require("dotenv").config();

const { database: db } = require("./services");

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

async function sendResendEmail({ to, subject, text, html, jobId }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `notification-${jobId}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Error(result.message || "Resend rejected the email request.");
  }
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
    ) {
      throw Error("WhatsApp configuration incomplete");
    }

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

    if (!response.ok) {
      throw Error("WhatsApp provider rejected request");
    }

    return;
  }

  if (!e.RESEND_API_KEY || !e.EMAIL_FROM || !e.OWNER_EMAIL) {
    throw Error("Email configuration incomplete");
  }

  const owner = job.channel === "owner_email";

  const detailsText = `
Booking ID: ${booking.id}
Parent/adult name: ${booking.name}
Email: ${booking.email}
Phone: ${booking.phone}
Learner age group: ${booking.age}
Course: ${booking.course}
Preferred date: ${booking.date}
Preferred time: ${booking.time}
Timezone: ${booking.timezone}
`.trim();

  const detailsHtml = `
    <p><strong>Booking ID:</strong> ${escapeHtml(booking.id)}</p>
    <p><strong>Parent/adult name:</strong> ${escapeHtml(booking.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(booking.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(booking.phone)}</p>
    <p><strong>Learner age group:</strong> ${escapeHtml(booking.age)}</p>
    <p><strong>Course:</strong> ${escapeHtml(booking.course)}</p>
    <p><strong>Preferred date:</strong> ${escapeHtml(booking.date)}</p>
    <p><strong>Preferred time:</strong> ${escapeHtml(booking.time)}</p>
    <p><strong>Timezone:</strong> ${escapeHtml(booking.timezone)}</p>
  `;

  if (owner) {
    await sendResendEmail({
      to: e.OWNER_EMAIL,
      subject: `New KiddoCode demo booking — ${booking.name}`,
      text: `New KiddoCode demo booking received.\n\n${detailsText}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;padding:24px;color:#172343">
          <h1 style="color:#3057d5">New KiddoCode Demo Booking</h1>
          <p>A new parent has requested a free demo.</p>
          <div style="background:#f2f5ff;border-radius:12px;padding:20px">
            ${detailsHtml}
          </div>
        </div>
      `,
      jobId: job.id,
    });

    return;
  }

  await sendResendEmail({
    to: booking.email,
    subject: "Your KiddoCode free demo request is received 🎉",
    text: `Hi ${booking.name},

Thank you for booking a free KiddoCode demo.

Your booking details:
${detailsText}

Our team will contact you shortly to confirm the final demo time and share the meeting link.

Regards,
KiddoCode Team`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7ff;padding:35px 15px;color:#172343">
        <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden">
          <div style="background:#3057d5;color:white;padding:30px;text-align:center">
            <h1 style="margin:0">🚀 KiddoCode</h1>
            <p style="margin:10px 0 0">Your free demo request is received!</p>
          </div>

          <div style="padding:30px">
            <h2>Hi ${escapeHtml(booking.name)}, 👋</h2>

            <p>
              Thank you for booking a free coding demo with KiddoCode.
              We are excited to help your learner begin their coding journey.
            </p>

            <div style="background:#eef4ff;border-left:5px solid #3057d5;padding:20px;border-radius:8px;margin:25px 0">
              <h3 style="margin-top:0">📅 Your booking details</h3>
              ${detailsHtml}
            </div>

            <p>
              Your selected time is a preferred time. Our team will contact you
              shortly to confirm mentor availability and share the meeting link.
            </p>

            <p>
              Regards,<br />
              <strong>KiddoCode Team</strong>
            </p>
          </div>

          <div style="background:#172343;color:white;text-align:center;padding:18px;font-size:13px">
            Learn programming • Build projects • Shape your future
          </div>
        </div>
      </div>
    `,
    jobId: job.id,
  });
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

      if (!booking) {
        throw Error("Booking unavailable");
      }

      await send(job, booking);

      await db(
        `notifications?id=eq.${job.id}&lease_token=eq.${job.lease_token}`,
        {
          method: "PATCH",
          body: {
            state: "sent",
            last_error: null,
          },
        },
      );

      console.log("notification_sent", job.id, job.channel);
    } catch (error) {
      await db(
        `notifications?id=eq.${job.id}&lease_token=eq.${job.lease_token}`,
        {
          method: "PATCH",
          body: {
            state: job.attempts >= 6 ? "failed" : "pending",
            last_error: error.message,
            available_at: new Date(
              Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000,
            ).toISOString(),
          },
        },
      );

      console.error("notification_failed", job.id, error.message);
    }
  }
}

async function loop() {
  console.log("KiddoCode email worker is running");

  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error("notification_queue_unavailable", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

if (require.main === module) {
  if (process.argv.includes("--once")) {
    tick().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  } else {
    loop();
  }
}

module.exports = { send, tick };
