// Records one-time codes instead of sending them, so tests can read the code back.
import type { OtpMessage, OtpSender } from "../auth/types.ts";

export class FakeOtpSender implements OtpSender {
  readonly sent: OtpMessage[] = [];
  async send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
  }
  /** The most recent code sent to a destination. */
  lastCode(destination: string): string {
    const message = [...this.sent].reverse().find((m) => m.destination === destination);
    if (!message) throw new Error(`No code sent to ${destination}`);
    return message.code;
  }
}
