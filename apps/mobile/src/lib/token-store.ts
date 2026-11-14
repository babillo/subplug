// The sign-in token lives in the phone's secure storage (iOS Keychain / Android Keystore),
// never in plain app storage. The browser preview (Expo web, development only) has no secure
// storage, so there it falls back to sessionStorage, which is cleared when the tab closes.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export async function readSecure(key: string): Promise<string | null> {
  if (isWeb) return globalThis.sessionStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function writeSecure(key: string, value: string): Promise<void> {
  if (isWeb) return void globalThis.sessionStorage?.setItem(key, value);
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function deleteSecure(key: string): Promise<void> {
  if (isWeb) return void globalThis.sessionStorage?.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}

export const TOKEN_KEY = "session-token";
