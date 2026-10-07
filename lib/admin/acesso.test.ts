import { afterEach, describe, expect, it } from "vitest";
import { ehAdmin, emailsAdmin } from "./acesso";

const original = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});

describe("acesso admin", () => {
  it("por padrão, só os donos (sem diferenciar maiúsculas)", () => {
    delete process.env.ADMIN_EMAILS;
    expect(ehAdmin("dollarweb3@gmail.com")).toBe(true);
    expect(ehAdmin(" TavanoAlexandre56@Gmail.com ")).toBe(true);
    expect(ehAdmin("outro@gmail.com")).toBe(false);
    expect(ehAdmin("dollarweb3@gmail.com.evil.com")).toBe(false);
    expect(ehAdmin(null)).toBe(false);
    expect(ehAdmin("")).toBe(false);
  });

  it("ADMIN_EMAILS substitui a lista padrão", () => {
    process.env.ADMIN_EMAILS = "a@x.com, B@x.com ,";
    expect(emailsAdmin()).toEqual(["a@x.com", "b@x.com"]);
    expect(ehAdmin("b@x.com")).toBe(true);
    expect(ehAdmin("dollarweb3@gmail.com")).toBe(false);
  });
});
