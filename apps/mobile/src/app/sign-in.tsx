// Sign in with a one-time code to a phone number or email. New customers add their name
// (and an email when signing up by phone: needed for their funding account).
import { brand } from "@repo/shared";
import type { SignInResult } from "@repo/shared/api";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Card, Field, Notice, Screen, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Step = "destination" | "code" | "profile";

export default function SignInScreen() {
  const { signedIn } = useAuth();
  const [step, setStep] = useState<Step>("destination");
  const [destination, setDestination] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const isPhone = !sentTo.includes("@");

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ destination: string; retryAfterSeconds: number }>("/api/auth/otp", {
        destination: destination.trim(),
      });
      setSentTo(r.destination);
      setResendIn(r.retryAfterSeconds);
      setCode("");
      setStep("code");
    } catch (e) {
      const err = e as ApiError;
      if (err.retryAfterSeconds) setResendIn(err.retryAfterSeconds);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signIn(withProfile: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<SignInResult>("/api/auth/sign-in", {
        destination: sentTo,
        code,
        ...(withProfile
          ? { fullName: fullName.trim(), ...(isPhone ? { email: email.trim() } : {}) }
          : {}),
      });
      if (r.status === "profile_required") return setStep("profile");
      if (!r.token)
        throw new ApiError(500, { message: "Sign-in didn’t return a session. Please try again." });
      await signedIn(r.token, r.user);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6, marginTop: 32 }}>
        <T variant="title">{brand.name}</T>
        <T tone="muted">Data and airtime in seconds, from your wallet.</T>
      </View>
      {error && <Notice tone="bad">{error}</Notice>}

      {step === "destination" && (
        <Card>
          <T variant="heading">Sign in or create an account</T>
          <Field
            label="Phone number or email"
            placeholder="0803 123 4567"
            autoCapitalize="none"
            autoComplete="tel"
            keyboardType="email-address"
            value={destination}
            onChangeText={setDestination}
            onSubmitEditing={() => destination.trim().length >= 5 && void sendCode()}
            returnKeyType="send"
          />
          <Button
            title={busy ? "Sending…" : "Send code"}
            onPress={() => void sendCode()}
            disabled={destination.trim().length < 5}
            busy={busy}
          />
        </Card>
      )}

      {step === "code" && (
        <Card>
          <Field
            label={`Code sent to ${sentTo}`}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
            hint="It expires in 10 minutes."
            style={{ fontSize: 26, letterSpacing: 8, textAlign: "center" }}
            autoFocus
          />
          <Button
            title={busy ? "Checking…" : "Continue"}
            onPress={() => void signIn(false)}
            disabled={code.length !== 6}
            busy={busy}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" onPress={() => setStep("destination")}>
              <T variant="label" tone="cobalt">
                Change number
              </T>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={resendIn > 0 || busy}
              onPress={() => void sendCode()}
            >
              <T variant="label" tone={resendIn > 0 ? "muted" : "cobalt"}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </T>
            </Pressable>
          </View>
        </Card>
      )}

      {step === "profile" && (
        <Card>
          <T variant="heading">Welcome! A few details</T>
          <Field
            label="Full name"
            autoComplete="name"
            textContentType="name"
            value={fullName}
            onChangeText={setFullName}
          />
          {isPhone && (
            <Field
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              hint="For your wallet funding account and receipts."
            />
          )}
          <Button
            title={busy ? "Creating…" : "Create account"}
            onPress={() => void signIn(true)}
            disabled={fullName.trim().length < 3 || (isPhone && !email.includes("@"))}
            busy={busy}
          />
        </Card>
      )}
    </Screen>
  );
}
