async function database(path, { method = "GET", body, headers = {} } = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Database not configured");
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const e = Error("Database request failed");
    e.code = data.code;
    throw e;
  }
  return response.status === 204 ? null : response.json();
}
async function verifyUser(authorization) {
  if (!authorization?.startsWith("Bearer ")) throw Error("Missing token");
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Invalid token");
  return response.json();
}
module.exports = { database, verifyUser };

