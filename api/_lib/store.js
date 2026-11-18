const base = () => process.env.SUPABASE_URL?.replace(/\\/$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export function storeReady() { return Boolean(base() && key()); }

async function request(path, options = {}) {
  if (!storeReady()) throw new Error("Supabase is not configured");
  const response = await fetch(`${base()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : [];
}

export function listProxies() {
  return request("mtproxy_instances?select=id,name,server,port,status,last_check,created_at&order=created_at.desc");
}
export function insertProxy(row) {
  return request("mtproxy_instances", { method: "POST", body: JSON.stringify(row) });
}
export function getProxy(id) {
  return request(`mtproxy_instances?id=eq.${encodeURIComponent(id)}&select=*`);
}
export function updateProxy(id, patch) {
  return request(`mtproxy_instances?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export function deleteProxy(id) {
  return request(`mtproxy_instances?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
}
