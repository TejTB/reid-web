import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "../validators.ts";

test("validateEmail accepts a normal address", () => {
  assert.equal(validateEmail("foo@bar.com"), null);
  assert.equal(validateEmail("  foo@bar.com  "), null);
});

test("validateEmail rejects empty / malformed / too long", () => {
  assert.match(validateEmail("") ?? "", /Enter your email/);
  assert.match(validateEmail("not-an-email") ?? "", /doesn't look right/);
  assert.match(validateEmail("a@b") ?? "", /doesn't look right/);
  assert.match(
    validateEmail("a".repeat(255) + "@b.com") ?? "",
    /too long/,
  );
});

test("validatePassword enforces length, upper, digit", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 12);
  assert.match(validatePassword("short") ?? "", /at least 12/);
  assert.match(validatePassword("nouppercase123") ?? "", /uppercase/);
  assert.match(validatePassword("NODIGITSHERE!") ?? "", /number/);
  assert.equal(validatePassword("GoodPassword12"), null);
});
