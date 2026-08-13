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
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { authClient } from "@/lib/auth-client";
import { useThemeColors } from "@/hooks/use-theme-colors";

interface FieldState {
  value: string;
  visible: boolean;
}

export default function ChangePasswordScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  // Session user yang sedang login
  const { data: session } = authClient.useSession();

  const currentUser = session?.user as
    | {
        name?: string;
        email?: string;
      }
    | undefined;

  const [currentPassword, setCurrentPassword] = useState<FieldState>({
    value: "",
    visible: false,
  });

  const [newPassword, setNewPassword] = useState<FieldState>({
    value: "",
    visible: false,
  });

  const [confirmPassword, setConfirmPassword] = useState<FieldState>({
    value: "",
    visible: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword() {
    setError(null);

    if (
      !currentPassword.value ||
      !newPassword.value ||
      !confirmPassword.value
    ) {
      setError("Semua field wajib diisi.");
      return;
    }

    if (newPassword.value.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }

    if (newPassword.value !== confirmPassword.value) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    if (newPassword.value === currentPassword.value) {
      setError("Password baru tidak boleh sama dengan password lama.");
      return;
    }

    // Pastikan ada session
    if (!session?.user) {
      setError("Sesi login tidak ditemukan. Silakan login kembali.");
      return;
    }

    setLoading(true);

    try {
      console.log("CHANGE PASSWORD START");

      const result = await authClient.changePassword({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        revokeOtherSessions: true,
      });

      console.log("CHANGE PASSWORD RESULT:", result);

      if (result.error) {
        console.log(
          "CHANGE PASSWORD ERROR:",
          JSON.stringify(result.error, null, 2)
        );

        setError(
          result.error.message ??
            "Gagal mengubah password. Periksa password saat ini."
        );

        return;
      }

      Alert.alert(
        "Berhasil",
        "Password akun kamu berhasil diubah.",
        [
          {
            text: "OK",
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (err) {
      console.error("CHANGE PASSWORD EXCEPTION:", err);

      setError("Terjadi kesalahan saat mengubah password.");
    } finally {
      setLoading(false);
    }
  }

  function renderPasswordField(
    label: string,
    state: FieldState,
    setState: React.Dispatch<React.SetStateAction<FieldState>>,
    placeholder: string
  ) {
    return (
      <View style={styles.fieldContainer}>
        <Text style={[styles.label, { color: colors.text }]}>
          {label}
        </Text>

        <View
          style={[
            styles.inputWrapper,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={colors.subtext}
          />

          <TextInput
            placeholder={placeholder}
            placeholderTextColor={colors.subtext}
            secureTextEntry={!state.visible}
            value={state.value}
            onChangeText={(text) =>
              setState((prev) => ({
                ...prev,
                value: text,
              }))
            }
            style={[
              styles.input,
              {
                color: colors.text,
              },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            onPress={() =>
              setState((prev) => ({
                ...prev,
                visible: !prev.visible,
              }))
            }
            hitSlop={8}
          >
            <Ionicons
              name={
                state.visible
                  ? "eye-off-outline"
                  : "eye-outline"
              }
              size={18}
              color={colors.subtext}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
        },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* HEADER */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>

        <Text
          style={[
            styles.headerTitle,
            {
              color: colors.text,
            },
          ]}
        >
          Ubah Password
        </Text>

        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* INTRO */}
        <View style={styles.introSection}>
          <View
            style={[
              styles.introIcon,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={28}
              color={colors.primary}
            />
          </View>

          <Text
            style={[
              styles.introTitle,
              {
                color: colors.text,
              },
            ]}
          >
            Ubah Password
          </Text>

          <Text
            style={[
              styles.introSubtitle,
              {
                color: colors.subtext,
              },
            ]}
          >
            Ubah password untuk akun yang sedang login.
          </Text>

          {currentUser?.email && (
            <Text
              style={[
                styles.emailText,
                {
                  color: colors.subtext,
                },
              ]}
            >
              {currentUser.email}
            </Text>
          )}
        </View>

        {/* PASSWORD LAMA */}
        {renderPasswordField(
          "Password Saat Ini",
          currentPassword,
          setCurrentPassword,
          "Masukkan password saat ini"
        )}

        {/* PASSWORD BARU */}
        {renderPasswordField(
          "Password Baru",
          newPassword,
          setNewPassword,
          "Minimal 8 karakter"
        )}

        {/* KONFIRMASI */}
        {renderPasswordField(
          "Konfirmasi Password Baru",
          confirmPassword,
          setConfirmPassword,
          "Ulangi password baru"
        )}

        {/* ERROR */}
        {error && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: "rgba(239,68,68,0.08)",
              },
            ]}
          >
            <Ionicons
              name="alert-circle"
              size={17}
              color={colors.danger}
            />

            <Text
              style={[
                styles.errorText,
                {
                  color: colors.danger,
                },
              ]}
            >
              {error}
            </Text>
          </View>
        )}

        {/* BUTTON */}
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={handleChangePassword}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={19}
                color={colors.bg}
              />

              <Text
                style={[
                  styles.buttonText,
                  {
                    color: colors.bg,
                  },
                ]}
              >
                Simpan Password
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* INFO */}
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={colors.subtext}
          />

          <Text
            style={[
              styles.infoText,
              {
                color: colors.subtext,
              },
            ]}
          >
            Kamu harus memasukkan password saat ini untuk
            mengubah password akun.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },

  backBtn: {
    padding: 4,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },

  form: {
    padding: 20,
    paddingBottom: 40,
  },

  introSection: {
    alignItems: "center",
    marginBottom: 24,
  },

  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  introTitle: {
    fontSize: 19,
    fontWeight: "700",
  },

  introSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 6,
  },

  emailText: {
    fontSize: 12,
    marginTop: 4,
  },

  fieldContainer: {
    marginTop: 16,
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  input: {
    flex: 1,
    fontSize: 15,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 18,
    borderRadius: 10,
    padding: 12,
  },

  errorText: {
    marginLeft: 8,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  button: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },

  buttonText: {
    fontWeight: "700",
    fontSize: 15,
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 16,
    paddingHorizontal: 4,
  },

  infoText: {
    flex: 1,
    marginLeft: 7,
    fontSize: 12,
    lineHeight: 17,
  },
});