const courses = [
  "Python Programming",
  "Java Programming",
  "C++ Programming",
  "Web Development",
  "Python with Machine Learning",
  "C# Programming",
];
function validateBooking(b) {
  if (!b || typeof b !== "object") throw Error("Invalid booking.");
  const string = (key) => (typeof b[key] === "string" ? b[key].trim() : "");
  const data = Object.fromEntries(
    ["name", "email", "phone", "age", "course", "date", "time", "timezone"].map(
      (k) => [k, string(k)],
    ),
  );
  data.email = data.email.toLowerCase();
  data.phone = data.phone.replace(/[ ()-]/g, "");
  if (string("website")) throw Error("Unable to accept this request.");
  if (b.consent !== true)
    throw Error("Please confirm that you are an adult or parent/guardian.");
  if (data.name.length < 2 || data.name.length > 100)
    throw Error("Enter a name between 2 and 100 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 254)
    throw Error("Enter a valid email.");
  if (!/^\+[1-9]\d{9,14}$/.test(data.phone))
    throw Error("Include your country code, for example +91 9876543210.");
  if (!["Under 10", "10–13", "14–17", "18+"].includes(data.age))
    throw Error("Choose an age group.");
  if (!courses.includes(data.course)) throw Error("Choose a listed course.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)
  )
    throw Error("Choose a valid preferred date and time.");
  const day = new Date(data.date + "T00:00:00Z");
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== data.date
  )
    throw Error("Choose a valid date.");
  let parts;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: data.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
  } catch {
    throw Error("Choose a valid timezone.");
  }
  const now = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (
    `${data.date}T${data.time}` <= now ||
    day.getTime() > Date.now() + 180 * 86400000
  )
    throw Error("Choose a future time within the next 180 days.");
  // This is a preferred wall-clock time, not a reserved slot. A mentor confirms DST/availability.
  return { ...data, consent: true };
}
module.exports = { validateBooking, courses };
