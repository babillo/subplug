import { brand } from "@repo/shared";

import { Button, Card, Screen, T } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth";

export default function OfflineScreen() {
  const { retry } = useAuth();
  return (
    <Screen>
      <T variant="title" style={{ marginTop: 40 }}>
        {brand.name}
      </T>
      <Card>
        <T variant="heading">Can’t connect</T>
        <T tone="muted">Check your internet connection and try again. You’re still signed in.</T>
        {__DEV__ && (
          <T variant="caption" tone="muted">
            Development: is the server running at {API_URL}?
          </T>
        )}
        <Button title="Try again" onPress={retry} />
      </Card>
    </Screen>
  );
}
