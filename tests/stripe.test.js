import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "../worker/src/stripe.js";

test("accepts a valid Stripe signature and rejects replay or tampering", async () => {
  const payload = '{"type":"customer.subscription.updated"}';
  const secret = "whsec_test";
  const timestamp = 1800000000;
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;
  assert.equal(await verifyStripeSignature(payload, header, secret, timestamp), true);
  assert.equal(await verifyStripeSignature(`${payload} `, header, secret, timestamp), false);
  assert.equal(await verifyStripeSignature(payload, header, secret, timestamp + 301), false);
  assert.equal(await verifyStripeSignature(payload, "t=bad,v1=bad", secret, timestamp), false);
});
