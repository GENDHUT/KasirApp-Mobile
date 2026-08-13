import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/auth-client";
import { api, type Order } from "@/lib/api";
import { useThemeColors } from "@/hooks/use-theme-colors";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalize(text: string) {
  return text.trim().toLowerCase();
}

export default function DashboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const currentUser = session?.user as
    | { id: string; name: string; username: string; email: string; role: "ADMIN" | "EMPLOYEE" }
    | undefined;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [search, setSearch] = useState("");

  const [myOrders, setMyOrders] = useState<Order[]>([]);

  const load = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const orders = await api.getCompletedOrders();

      /*
      |--------------------------------------------------------------------------
      | FILTER MILIK SENDIRI
      |--------------------------------------------------------------------------
      |
      | Server mengembalikan SEMUA pesanan completed kalau role ADMIN.
      | Di sini kita filter ulang supaya Dashboard SELALU menampilkan
      | history milik user yang sedang login saja, terlepas dari role-nya.
      |
      */

      const ownOrders = orders.filter(
        (order) => order.userId === currentUser.id
      );

      ownOrders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setMyOrders(ownOrders);
    } catch (err) {
      Alert.alert(
        "Gagal memuat history",
        err instanceof Error ? err.message : "Terjadi kesalahan"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    load();
  }

  const totalRevenue = useMemo(
    () => myOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    [myOrders]
  );

  const filteredOrders = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return myOrders;

    return myOrders.filter((order) =>
      normalize(order.orderNumber).includes(keyword)
    );
  }, [myOrders, search]);

  function handleChangePassword() {
    router.push("/change-password");
  }

  function handleLogout() {
    Alert.alert("Keluar", "Yakin ingin keluar dari akun ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            await authClient.signOut();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <Text style={[styles.pageTitle, { color: colors.text }]}>Dashboard</Text>

      {/* Profile Card */}
      <View
        style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View
          style={[styles.avatarWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}
        >
          <Image
            source={{ uri: `${API_URL}/Logo.webp` }}
            style={styles.avatarImage}
            resizeMode="contain"
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.profileName, { color: colors.text }]}>
            {currentUser?.name ?? "-"}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 1 }}>
            @{currentUser?.username} • {currentUser?.email}
          </Text>

          <View
            style={[
              styles.roleBadge,
              { backgroundColor: currentUser?.role === "ADMIN" ? colors.primary : colors.border },
            ]}
          >
            <Text
              style={{
                color: currentUser?.role === "ADMIN" ? colors.bg : colors.text,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {currentUser?.role}
            </Text>
          </View>
        </View>
      </View>

      {/* Account Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleChangePassword}
        >
          <Ionicons name="key-outline" size={18} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: "600" }}>Change Password</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.danger }]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: "600" }}>Logout</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Ringkasan Pendapatan Pribadi */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Ringkasan Penjualan Kamu
      </Text>

      <View style={styles.summaryRow}>
        <View
          style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.summaryIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="cash-outline" size={16} color={colors.bg} />
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
            Total Pendapatan
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {formatCurrency(totalRevenue)}
          </Text>
        </View>

        <View
          style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.summaryIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="receipt-outline" size={16} color={colors.bg} />
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
            Total Transaksi
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {myOrders.length}
          </Text>
        </View>
      </View>

      {/* History */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>
        History Transaksi Kamu
      </Text>

      <View
        style={[styles.searchWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}
      >
        <Ionicons name="search-outline" size={16} color={colors.subtext} />
        <TextInput
          placeholder="Cari nomor pesanan..."
          placeholderTextColor={colors.subtext}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      {filteredOrders.length === 0 ? (
        <View
          style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Ionicons name="receipt-outline" size={28} color={colors.subtext} />
          <Text style={{ color: colors.subtext, marginTop: 8, textAlign: "center" }}>
            {search
              ? `Tidak ada transaksi dengan nomor "${search}".`
              : "Belum ada transaksi yang selesai."}
          </Text>
        </View>
      ) : (
        filteredOrders.map((order) => (
          <View
            key={order.id}
            style={[styles.historyRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {order.orderNumber}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: "#16a34a" }]}>
                <Text style={styles.statusPillText}>SELESAI</Text>
              </View>
            </View>

            <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>
              {order.completedAt ? formatDate(order.completedAt) : formatDate(order.createdAt)}
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 10,
              }}
            >
              <View style={styles.paymentBadge}>
                <Ionicons
                  name={order.paymentMethod === "QRIS" ? "qr-code-outline" : "cash-outline"}
                  size={13}
                  color={colors.subtext}
                />
                <Text style={{ color: colors.subtext, fontSize: 12, marginLeft: 4 }}>
                  {order.paymentMethod ?? "-"} • {order.items.length} item
                </Text>
              </View>

              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>
                {formatCurrency(order.total)}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 34, height: 34 },
  profileName: { fontSize: 16, fontWeight: "700" },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10, marginTop: 8 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14 },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryValue: { fontSize: 17, fontWeight: "800", marginTop: 4 },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14 },
  emptyState: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 32,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  historyRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  paymentBadge: { flexDirection: "row", alignItems: "center" },
});