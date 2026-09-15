const API_BASE = "https://kiddocode.onrender.com";
"use strict";
(async () => {
  const form = document.getElementById("auth-form"),
    dashboard = document.getElementById("lead-list");
  const message =
    form?.querySelector(".form-message") ||
    document.getElementById("dashboard-message");
  function say(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
  }
  if (form) {
    form.querySelector("button").disabled = true;
    // Prevent a native submission while asynchronous configuration is loading.
    form.addEventListener("submit", (event) => event.preventDefault());
  }
  let config;
  try {
const r = await fetch(`${API_BASE}/api/config`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error();
    config = await r.json();
    if (!config.supabaseUrl || !config.supabaseKey) throw Error();
  } catch {
    say(
      "Accounts are not configured yet. You can still contact KiddoCode for a demo.",
      true,
    );
    if (form) form.querySelector("button").disabled = true;
    return;
  }
  let session;
  try {
    session = JSON.parse(sessionStorage.getItem("kiddo-session") || "null");
  } catch {}
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has("access_token")) {
    session = {
      access_token: hash.get("access_token"),
      refresh_token: hash.get("refresh_token"),
      expires_at: Date.now() + Number(hash.get("expires_in") || 3600) * 1000,
    };
    sessionStorage.setItem("kiddo-session", JSON.stringify(session));
    history.replaceState(null, "", location.pathname);
  }
  if (hash.has("error_description")) {
    say(hash.get("error_description"), true);
    history.replaceState(null, "", location.pathname);
  }
  async function auth(path, body, method = "POST", token) {
    const r = await fetch(config.supabaseUrl + "/auth/v1/" + path, {
      method,
      headers: {
        apikey: config.supabaseKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok)
      throw Error(
        result.msg ||
          result.message ||
          result.error_description ||
          "Account request failed. Please try again.",
      );
    return result;
  }
  function keep(value) {
    session = {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at: Date.now() + value.expires_in * 1000,
    };
    sessionStorage.setItem("kiddo-session", JSON.stringify(session));
  }
  async function token() {
    if (!session?.access_token)
      throw Error("Please log in to view your account.");
    if (Date.now() > session.expires_at - 60000) {
      try {
        keep(
          await auth("token?grant_type=refresh_token", {
            refresh_token: session.refresh_token,
          }),
        );
      } catch {
        sessionStorage.removeItem("kiddo-session");
        throw Error("Your session expired. Please log in again.");
      }
    }
    return session.access_token;
  }
  if (form)
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector("button");
      if (button.disabled) return;
      button.disabled = true;
      say("Working…");
      const mode = form.dataset.mode,
        email = form.elements.email?.value.trim(),
        password = form.elements.password?.value;
      try {
        if (mode === "login") {
          keep(await auth("token?grant_type=password", { email, password }));
          location.href = "dashboard.html";
        }
        if (mode === "signup") {
          await auth(
            "signup?redirect_to=" +
              encodeURIComponent(location.origin + "/dashboard.html"),
            { email, password, data: { adult: true } },
          );
          say(
            "Check your email to confirm your account, then log in. If you already have an account, use Log in or Forgot password.",
          );
          form.reset();
        }
        if (mode === "forgot") {
          await auth(
            "recover?redirect_to=" +
              encodeURIComponent(location.origin + "/reset.html"),
            { email },
          );
          say(
            "If an account exists for this email, you will receive a reset link. Please check your spam folder too.",
          );
        }
        if (mode === "reset") {
          await auth("user", { password }, "PUT", await token());
          await auth("logout", {}, "POST", session.access_token).catch(
            () => {},
          );
          sessionStorage.removeItem("kiddo-session");
          session = null;
          say("Password updated. You can now log in with your new password.");
          form.reset();
        }
      } catch (e) {
        say(e.message, true);
      } finally {
        button.disabled = false;
      }
    });
  if (form) form.querySelector("button").disabled = false;
  if (!dashboard) return;
  if (!session) {
    location.replace("login.html");
    return;
  }
  let rows = [],
    admin = false,
    page = 0;
  async function api(path, options = {}) {
    const r = await fetch(`${API_BASE}/api/account/` + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (await token()),
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.message || "Request failed.");
    return data;
  }
  const make = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  function render() {
    dashboard.replaceChildren();
    const query = document.getElementById("lead-search").value.toLowerCase(),
      status = document.getElementById("status-filter").value;
    const filtered = rows.filter(
      (r) =>
        (!status || r.status === status) &&
        [r.name, r.email, r.course, r.phone]
          .join(" ")
          .toLowerCase()
          .includes(query),
    );
    if (!filtered.length) {
      dashboard.append(
        make(
          "p",
          rows.length
            ? "No requests match these filters."
            : "No demo requests on this page. Book a demo with your account email to see it here.",
          "empty",
        ),
      );
      return;
    }
    for (const row of filtered) {
      const card = make("article", null, "lead-item"),
        left = make("div"),
        right = make("div");
      left.append(
        make("h3", row.course),
        make("p", row.name + " · " + row.age),
        make(
          "p",
          "Preferred: " +
            row.date +
            " " +
            row.time.slice(0, 5) +
            " · " +
            row.timezone,
        ),
        make("p", "Reference: " + row.id),
      );
      right.append(make("p", row.email), make("p", "Status: " + row.status));
      if (admin) {
        right.append(make("p", row.phone));
        const label = make("label", "Lead status"),
          select = make("select");
        for (const s of [
          "New",
          "Contacted",
          "Demo Booked",
          "Converted",
          "Not Interested",
        ])
          select.add(new Option(s, s));
        select.value = row.status;
        label.append(select);
        right.append(label);
        select.addEventListener("change", async () => {
          select.disabled = true;
          try {
            await api("bookings/" + row.id, {
              method: "PATCH",
              body: JSON.stringify({ status: select.value }),
            });
            row.status = select.value;
            say("Status saved.");
            render();
          } catch (e) {
            select.value = row.status;
            say(e.message, true);
          } finally {
            select.disabled = false;
          }
        });
        const call = make("a", "Call parent ↗");
        call.href = "tel:" + row.phone;
        right.append(call);
      }
      card.append(left, right);
      dashboard.append(card);
    }
  }
  async function load() {
    say("Loading requests…");
    try {
      const result = await api("bookings?page=" + page);
      rows = result.rows;
      admin = result.admin;
      document.getElementById("account-email").textContent = result.email || "";
      document.querySelector(".dashboard-title").textContent = admin
        ? "Lead dashboard"
        : "Demo requests";
      document.getElementById("next").disabled = !result.hasMore;
      document.getElementById("previous").disabled = page === 0;
      document.getElementById("page-number").textContent = "Page " + (page + 1);
      render();
      say("");
    } catch (e) {
      say(e.message + " You can refresh or log out and sign in again.", true);
    }
  }
  document.getElementById("lead-search").addEventListener("input", render);
  document.getElementById("status-filter").addEventListener("change", render);
  document.getElementById("reload").addEventListener("click", load);
  document.getElementById("previous").addEventListener("click", () => {
    page = Math.max(0, page - 1);
    load();
  });
  document.getElementById("next").addEventListener("click", () => {
    page++;
    load();
  });
  document.getElementById("logout").addEventListener("click", async () => {
    try {
      await auth("logout", {}, "POST", await token());
    } catch {}
    sessionStorage.removeItem("kiddo-session");
    location.replace("login.html");
  });
  await load();
})();
