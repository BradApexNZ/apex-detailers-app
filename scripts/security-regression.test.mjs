import test from "node:test";
import assert from "node:assert/strict";
import { escapeMarkup } from "../src/html-safety.js";

test("calendar text is rendered as text rather than executable markup", () => {
  const payload = `<img src=x onerror="globalThis.compromised=true"> O'Reilly & Sons`;
  const escaped = escapeMarkup(payload);
  assert.equal(escaped, "&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt; O&#39;Reilly &amp; Sons");
  assert.equal(escaped.includes("<img"), false);
});
