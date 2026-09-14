"use strict";
const menuButton = document.querySelector(".menu-button"),
  menu = document.getElementById("nav-links");
menuButton.hidden = false;
function closeMenu() {
  menu.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}
menuButton.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
menu.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu.classList.contains("open")) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("nav")) closeMenu();
});
const form = document.getElementById("demoBookingForm");
if (form) {
  const date = form.elements.date;
  date.min = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  date.max = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (
    !Array.from(form.elements.timezone.options).some(
      (o) => o.value === localZone,
    )
  ) {
    const o = new Option(localZone, localZone);
    form.elements.timezone.add(o);
  }
  form.elements.timezone.value = localZone;
  document.querySelectorAll("[data-course]").forEach((a) =>
    a.addEventListener("click", () => {
      form.elements.course.value = a.dataset.course;
    }),
  );
  let pending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    const payload = Object.fromEntries(new FormData(form));
    payload.consent = form.elements.consent.checked;
    const body = JSON.stringify(payload);
    const button = form.querySelector("button[type=submit]"),
      message = form.querySelector(".form-message");
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "Saving your request…";
    form.setAttribute("aria-busy", "true");
    message.classList.remove("error");
    message.textContent = "";
    const slow = setTimeout(() => {
      message.textContent =
        "Still connecting. Your server may be waking up; please keep this page open.";
    }, 6000);
    try {
      // Lock submission before hashing: two rapid clicks must not race.
      // Store a hash and retry ID, never the parent's form details.
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
        ),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      let saved;
      try {
        saved = JSON.parse(sessionStorage.getItem("kiddo-request") || "null");
      } catch {}
      const key = saved?.digest === digest ? saved.key : crypto.randomUUID();
      try {
        sessionStorage.setItem(
          "kiddo-request",
          JSON.stringify({ digest, key }),
        );
      } catch {}
const response = await fetch(
  "https://kiddocode.onrender.com/api/bookings",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key
    },
    body,
    signal: AbortSignal.timeout(75000)
  }
);

const text = await response.text();
const result = text ? JSON.parse(text) : {};

if (!response.ok) {
  throw new Error(result.message || "Booking request failed.");
}
      if (!response.ok || !result.success || !result.id)
        throw Error(result.message || "Unable to confirm your request.");
      form.hidden = true;
      const success = document.getElementById("booking-success");
      success.hidden = false;
      document.getElementById("booking-reference").textContent =
        "Reference: " + result.id;
      document.getElementById("booking-whatsapp").href =
        "https://wa.me/918077481604?text=" +
        encodeURIComponent(
          "Hi KiddoCode! I submitted a demo request. Reference: " + result.id,
        );
      success.focus();
      form.reset();
    } catch (e) {
      message.classList.add("error");
      message.textContent =
        e.name === "TimeoutError"
          ? "This is taking longer than expected. Your request may already be saved. Retry with the same details to avoid a duplicate."
          : e.message === "Failed to fetch"
            ? "Connection failed. Your details are still here. Please retry."
            : e.message;
    } finally {
      clearTimeout(slow);
      pending = false;
      button.disabled = false;
      button.innerHTML = original;
      form.removeAttribute("aria-busy");
    }
  });
}
