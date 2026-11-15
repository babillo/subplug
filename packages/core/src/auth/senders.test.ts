// Which sign-in code sender runs where. Printing codes to the log is only for development and the
// private staging site, never production.
import { describe, expect, it } from "vitest";

import { ConsoleOtpSender, createOtpSenderFromEnv } from "./senders.ts";

describe("createOtpSenderFromEnv", () => {
  it("uses the console sender on the laptop", () => {
    expect(createOtpSenderFromEnv({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleOtpSender);
  });

  it("allows the console sender on staging, even in a production build", () => {
    expect(createOtpSenderFromEnv({ NODE_ENV: "production", APP_ENV: "staging" })).toBeInstanceOf(
      ConsoleOtpSender,
    );
  });

  it("refuses the console sender in production", () => {
    expect(() => createOtpSenderFromEnv({ APP_ENV: "production" })).toThrow(/production/);
    expect(() =>
      createOtpSenderFromEnv({ NODE_ENV: "development", APP_ENV: "production" }),
    ).toThrow();
  });

  it("without APP_ENV, a production build still refuses it (nothing gets looser by accident)", () => {
    expect(() => createOtpSenderFromEnv({ NODE_ENV: "production" })).toThrow(/production/);
  });

  it("refuses unknown APP_ENV values", () => {
    expect(() => createOtpSenderFromEnv({ APP_ENV: "prod" })).toThrow(/APP_ENV/);
  });
});
