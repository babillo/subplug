// The app's root: fonts, sign-in state and which screens are reachable.
// Signed out → sign-in only. Signed in without a PIN → set-pin only. Otherwise the app.
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "@/lib/auth";
import { fonts, useColors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppStack />
    </AuthProvider>
  );
}

function AppStack() {
  const { state } = useAuth();
  const c = useColors();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const ready = (fontsLoaded || !!fontError) && state.status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  const signedIn = state.status === "signed_in";
  const hasPin = signedIn && state.user.hasPin;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.paper },
          headerTintColor: c.fg,
          headerTitleStyle: { fontFamily: fonts.display },
          contentStyle: { backgroundColor: c.paper },
        }}
      >
        <Stack.Protected guard={state.status === "signed_out" || state.status === "loading"}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={state.status === "offline"}>
          <Stack.Screen name="offline" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasPin}>
          <Stack.Screen name="set-pin" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={hasPin}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
