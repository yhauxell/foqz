import { describe, expect, it } from "vitest";
import {
  authTokenFrom,
  installerTokenFrom,
  isLoopbackUrl,
  placeholderAdminBlocked,
} from "../../../scripts/pocketbase-schema-auth.mjs";

describe("pocketbase schema admin selection", () => {
  it("reads the JWT from an installer URL", () => {
    expect(installerTokenFrom("https://foqz.yruiz.site/_/#/pbinstall/aaa.bbb.ccc")).toBe(
      "aaa.bbb.ccc"
    );
    expect(installerTokenFrom("  aaa.bbb.ccc  ")).toBe("aaa.bbb.ccc");
    expect(installerTokenFrom("")).toBe("");
  });

  it("accepts a raw or Bearer superuser JWT", () => {
    expect(authTokenFrom("aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
    expect(authTokenFrom("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
    expect(authTokenFrom("")).toBe("");
  });

  it("treats only loopback as a safe host for the example.com admin", () => {
    expect(isLoopbackUrl("http://127.0.0.1:8092")).toBe(true);
    expect(isLoopbackUrl("http://localhost:8090")).toBe(true);
    expect(isLoopbackUrl("https://foqz.yruiz.site")).toBe(false);
    expect(placeholderAdminBlocked("https://foqz.yruiz.site", "admin@example.com")).toBe(true);
    expect(placeholderAdminBlocked("http://127.0.0.1:8092", "admin@example.com")).toBe(false);
    expect(placeholderAdminBlocked("https://foqz.yruiz.site", "yau@yruiz.com")).toBe(false);
  });
});
