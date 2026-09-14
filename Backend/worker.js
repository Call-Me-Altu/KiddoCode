require("dotenv").config();
const { database: db } = require("./services");
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
const text = owner
  ? `New KiddoCode demo booking

Booking ID: ${booking.id}
Parent/adult name: ${booking.name}
Email: ${booking.email}
Phone: ${booking.phone}
Learner age group: ${booking.age}
Course selected: ${booking.course}
Preferred date: ${booking.date}
Preferred time: ${booking.time}
Timezone: ${booking.timezone}

Open your KiddoCode dashboard to manage this lead.`
  : `Hi ${booking.name},

Your free KiddoCode demo request has been received successfully. 🎉

Your booking details:
• Course: ${booking.course}
• Learner age group: ${booking.age}
• Preferred date: ${booking.date}
• Preferred time: ${booking.time}
• Timezone: ${booking.timezone}
• Booking reference: ${booking.id}

Our team will contact you shortly to confirm the final demo time and share the meeting details.

Regards,
KiddoCode Team`;
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
        ? "New KiddoCode demo request"
        : "Your KiddoCode demo request",
      text,
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
      const [booking] = await db(`bookings?id=eq.${job.booking_id}&select=*`);
      if (!booking) throw Error("Booking unavailable");
      await send(job, booking);
      await db(
        `notifications?id=eq.${job.id}&lease_token=eq.${job.lease_token}`,
        { method: "PATCH", body: { state: "sent", last_error: null } },
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
