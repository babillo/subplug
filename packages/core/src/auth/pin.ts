// The 4-digit transaction PIN (CLAUDE.md rule 8): bcrypt-hashed, locked after 5 wrong tries.
import bcrypt from "bcryptjs";

import { AuthError } from "./errors.ts";

/** Wrong PINs in a row before purchases are locked (until reset with a one-time code). */
export const PIN_MAX_ATTEMPTS = 5;

/** bcrypt work factor: ~100ms per check in plain JavaScript, so guessing is slow. */
const BCRYPT_ROUNDS = 10;

const SEQUENCES = "0123456789";

/** Throws unless the PIN is exactly 4 digits and not trivially guessable. */
export function checkPinFormat(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new AuthError("invalid_pin_format", "Your PIN must be exactly 4 digits");
  }
  const allSame = /^(\d)\1{3}$/.test(pin);
  const ascending = SEQUENCES.includes(pin);
  const descending = SEQUENCES.split("").reverse().join("").includes(pin);
  if (allSame || ascending || descending) {
    throw new AuthError("weak_pin", "That PIN is too easy to guess. Choose another one.");
  }
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export function pinMatches(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
