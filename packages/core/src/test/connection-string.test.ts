import { normaliseConnectionString } from "@repo/db";
import { describe, expect, it } from "vitest";

describe("normaliseConnectionString", () => {
  it("turns Neon's sslmode=require into the equivalent, explicit verify-full", () => {
    expect(
      normaliseConnectionString(
        "postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      ),
    ).toBe(
      "postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
    );
    expect(normaliseConnectionString("postgres://h/db?a=1&sslmode=prefer")).toBe(
      "postgres://h/db?a=1&sslmode=verify-full",
    );
  });

  it("leaves other modes and URLs without sslmode alone", () => {
    expect(normaliseConnectionString("postgres://h/db?sslmode=disable")).toBe(
      "postgres://h/db?sslmode=disable",
    );
    expect(normaliseConnectionString("postgres://h/db")).toBe("postgres://h/db");
    expect(normaliseConnectionString("postgres://h/db?sslmode=verify-full")).toBe(
      "postgres://h/db?sslmode=verify-full",
    );
  });
});
