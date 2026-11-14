"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

type Step = "destination" | "code" | "profile";
type SignedIn = { status: "signed_in"; user: { hasPin: boolean } };
type SignInResponse = SignedIn | { status: "profile_required" };

export function SignInFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("destination");
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const isPhone = !destination.includes("@");

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ destination: string; retryAfterSeconds: number }>(
        "/api/auth/otp",
        { destination },
      );
      setSentTo(result.destination);
      setResendIn(result.retryAfterSeconds);
      setStep("code");
    } catch (e) {
      if (e instanceof ApiError && e.retryAfterSeconds) setResendIn(e.retryAfterSeconds);
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function signIn(withProfile: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<SignInResponse>("/api/auth/sign-in", {
        destination: sentTo,
        code,
        ...(withProfile ? { fullName, ...(isPhone ? { email } : {}) } : {}),
      });
      if (result.status === "profile_required") {
        setStep("profile");
        return;
      }
      router.replace(result.user.hasPin ? "/dashboard" : "/set-pin");
      router.refresh();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      {error && <Notice tone="bad">{error.message}</Notice>}

      {step === "destination" && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <TextField
            id="destination"
            label="Phone number or email"
            placeholder="0803 123 4567"
            autoComplete="tel"
            inputMode="email"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy || destination.trim().length < 5}>
            {busy ? "Sending…" : "Send code"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(false);
          }}
        >
          <TextField
            id="code"
            label={`Code sent to ${sentTo}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="num w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 font-display text-2xl tracking-[.4em] outline-none focus:border-cobalt"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            hint="It expires in 10 minutes."
            required
          />
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Continue"}
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              className="font-semibold text-cobalt"
              onClick={() => {
                setStep("destination");
                setCode("");
                setError(null);
              }}
            >
              Use a different number
            </button>
            <button
              type="button"
              className="font-semibold text-cobalt disabled:text-muted"
              disabled={resendIn > 0 || busy}
              onClick={() => void sendCode()}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "profile" && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(true);
          }}
        >
          <p className="text-muted">
            Welcome! Tell us who you are to finish creating your account.
          </p>
          <TextField
            id="fullName"
            label="Full name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          {isPhone && (
            <TextField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint="Needed for your wallet's bank account number."
              required
            />
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}
    </div>
  );
}
