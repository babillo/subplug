import { describe, expect, it } from "vitest";

import { guessNetwork, NETWORKS } from "./networks";

describe("guessNetwork", () => {
  it.each([
    ["08031234567", "mtn"],
    ["07061234567", "mtn"],
    ["09161234567", "mtn"],
    ["08021234567", "airtel"],
    ["09071234567", "airtel"],
    ["08051234567", "glo"],
    ["09151234567", "glo"],
    ["08091234567", "9mobile"],
    ["09091234567", "9mobile"],
  ])("suggests a network for %s", (phone, network) => {
    expect(guessNetwork(phone)).toBe(network);
  });

  it("works on partly typed or formatted numbers", () => {
    expect(guessNetwork("0803")).toBe("mtn");
    expect(guessNetwork("+234 805 111 2222")).toBe("glo");
  });

  it("returns null when it can't tell", () => {
    expect(guessNetwork("080")).toBeNull();
    expect(guessNetwork("07001234567")).toBeNull();
    expect(guessNetwork("")).toBeNull();
  });

  it("lists the four networks in a fixed order", () => {
    expect(NETWORKS.map((n) => n.id)).toEqual(["mtn", "airtel", "glo", "9mobile"]);
  });
});
