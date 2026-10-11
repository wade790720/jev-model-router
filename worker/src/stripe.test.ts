import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { verifyStripeSignature } from "./stripe";

test("accepts a valid Stripe signature and rejects replay or tampering", async () => {
  const payload = '{"type":"customer.subscription.updated"}';
  const secret = "whsec_test";
  const timestamp = 1800000000;
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;
  expect(await verifyStripeSignature(payload, header, secret, timestamp)).toBe(true);
  expect(await verifyStripeSignature(`${payload} `, header, secret, timestamp)).toBe(false);
  expect(await verifyStripeSignature(payload, header, secret, timestamp + 301)).toBe(false);
  expect(await verifyStripeSignature(payload, "t=bad,v1=bad", secret, timestamp)).toBe(false);
});
