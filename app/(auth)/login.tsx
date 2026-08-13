import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/auth-client";
import { useThemeColors } from "@/hooks/use-theme-colors";

export default function LoginScreen() {
  const colors = useThemeColors();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }

    setError(null);
    setLoading(true);

    const { error: authError } = await authClient.signIn.username({
      username: username.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Username atau password salah.");
    }
    // redirect otomatis ditangani root layout via useSession
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View
            style={[
              styles.logoWrapper,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Image
              source={{ uri: `${API_URL}/Logo.webp` }}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Ala-Ala</Text>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            Kasir cepat, laporan rapi.{"\n"}Masuk untuk mulai melayani pelanggan.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View
            style={[
              styles.inputWrapper,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="person-outline" size={18} color={colors.subtext} />
            <TextInput
              placeholder="Username"
              placeholderTextColor={colors.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              style={[styles.input, { color: colors.text }]}
            />
          </View>

          <View
            style={[
              styles.inputWrapper,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={colors.subtext} />
            <TextInput
              placeholder="Password"
              placeholderTextColor={colors.subtext}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { color: colors.text }]}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={colors.subtext}
              />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={{ color: colors.danger, marginLeft: 6, flex: 1 }}>
                {error}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <>
                <Text style={{ color: colors.bg, fontWeight: "700", fontSize: 15 }}>
                  Masuk
                </Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: colors.subtext }]}>
          Lupa password? Hubungi admin toko kamu.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  brand: { alignItems: "center", marginBottom: 36 },
  logoWrapper: {
    width: 84,
    height: 84,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  logo: { width: 56, height: 56 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: 0.2 },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  form: { gap: 12 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15 },
  errorRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  button: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 28,
  },
});