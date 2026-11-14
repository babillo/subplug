// How one-time codes leave the system. In development a ConsoleOtpSender prints them; a real SMS or
// email provider (e.g. Termii, Resend) plugs in later as another OtpSender, with no other changes.

export interface OtpMessage {
  channel: "sms" | "email";
  /** Normalised phone (0XXXXXXXXXX) or lower-case email. */
  destination: string;
  /** The 6-digit code. Only the sender ever sees it; the database stores a hash. */
  code: string;
  purpose: "sign_in" | "pin_reset";
}

export interface OtpSender {
  send(message: OtpMessage): Promise<void>;
}
