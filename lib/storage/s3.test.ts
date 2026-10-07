import { describe, expect, it } from "vitest";
import { newKey, ownsKey } from "./s3";

describe("keys do S3", () => {
  it("newKey fica sob o prefixo do usuário, com extensão do tipo", () => {
    const k = newKey("u1", "videos", "video/mp4");
    expect(k).toMatch(/^users\/u1\/videos\/[A-Za-z0-9_-]{12}\.mp4$/);
    expect(ownsKey("u1", k)).toBe(true);
  });

  it("ownsKey recusa keys de outra conta, prefixos parecidos e path traversal", () => {
    expect(ownsKey("u1", "users/u2/refs/a.jpg")).toBe(false);
    expect(ownsKey("u1", "users/u10/refs/a.jpg")).toBe(false);
    expect(ownsKey("u1", "users/u1/../u2/refs/a.jpg")).toBe(false);
    expect(ownsKey("u1", "other/u1/refs/a.jpg")).toBe(false);
  });
});
