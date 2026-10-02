const encoder = new TextEncoder();

export async function verifyStripeSignature(payload, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || !signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map(part => part.trim().split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const signatures = signatureHeader.split(",").filter(part => part.trim().startsWith("v1=")).map(part => part.trim().slice(3));
  if (!signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const actual = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)));
  return signatures.some(hex => {
    if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
    const expected = Uint8Array.from(hex.match(/.{2}/g), byte => Number.parseInt(byte, 16));
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  });
}

export async function stripeRequest(env, path, options = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe secret is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? `Stripe HTTP ${response.status}`);
  return body;
}
