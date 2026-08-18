import { useCallback, useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { View, ActivityIndicator, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { requestBlePermissions } from "@/lib/struk/thermal-printer";

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const segments = useSegments();
  const router = useRouter();
  const colors = useThemeColors();

  /*
  |--------------------------------------------------------------------------
  | IMMERSIVE MODE (Android, edge-to-edge safe)
  |--------------------------------------------------------------------------
  |
  | Android 15+ (targetSdk 35+) mewajibkan edge-to-edge, sehingga API lama
  | NavigationBar.setBehaviorAsync() (mode "immersive sticky") TIDAK
  | didukung lagi -- makanya kita tidak memanggilnya sama sekali.
  |
  | Cukup NavigationBar.setVisibilityAsync("hidden") -- di mode edge-to-edge
  | ini otomatis menyembunyikan status bar & navigation bar sekaligus
  | (dianggap satu kesatuan "system bars").
  |
  | Karena behavior sticky tidak bisa diatur, kita simulasikan manual:
  | begitu user swipe dan system bar muncul sementara, kita sembunyikan
  | lagi otomatis setelah beberapa detik.
  |
  */

  const hideSystemBars = useCallback(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setVisibilityAsync("hidden");
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    hideSystemBars();

    const subscription = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === "visible") {
        setTimeout(hideSystemBars, 2000);
      }
    });

    return () => subscription.remove();
  }, [hideSystemBars]);

  useEffect(() => {
    if (isPending) return;

    const inAuthScreen = segments[0] === "login";

    if (!session && !inAuthScreen) {
      router.replace("/(auth)/login");
    } else if (session && inAuthScreen) {
      router.replace("/");
    }
  }, [session, isPending, segments, router]);

  /*
  |--------------------------------------------------------------------------
  | IZIN BLUETOOTH (ANDROID)
  |--------------------------------------------------------------------------
  |
  | Diminta sekali begitu app pertama kali dibuka (bukan cuma pas user buka
  | fitur cetak struk), supaya popup izin sudah muncul dari awal. Kalau di
  | tolak di sini, tidak masalah -- print-receipt-modal.tsx tetap akan minta
  | ulang saat user benar-benar mencoba cetak.
  |
  | Ini fire-and-forget, tidak perlu ditunggu (await) di sini karena tidak
  | ada UI yang bergantung pada hasilnya saat startup.
  |
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    requestBlePermissions();
  }, []);

  if (isPending) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.bg,
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar hidden style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen
          name="pesanan"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen name="change-password" />
      </Stack>
    </SafeAreaProvider>
  );
}