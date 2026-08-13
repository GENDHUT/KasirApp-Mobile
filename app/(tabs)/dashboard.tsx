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

import { authClient, API_URL } from "@/lib/auth-client";
import { api, type Order } from "@/lib/api";
import { useThemeColors } from "@/hooks/use-theme-colors";

import { PrintReceiptModal } from "@/components/struk/print-receipt-modal";
import { toReceiptOrder } from "@/lib/struk/receipt-mapper";
import { type ReceiptOrder } from "@/lib/struk/receipt-types";

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
    | {
        id: string;
        name: string;
        username: string;
        email: string;
        role: "ADMIN" | "EMPLOYEE";
      }
    | undefined;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [search, setSearch] = useState("");

  const [myOrders, setMyOrders] = useState<Order[]>([]);

  // ---------------------------------------------------------------------------
  // PRINT / REPRINT STRUK
  // ---------------------------------------------------------------------------

  const [printReceiptOrder, setPrintReceiptOrder] =
    useState<ReceiptOrder | null>(null);

  const [printModalVisible, setPrintModalVisible] = useState(false);

  // ---------------------------------------------------------------------------
  // LOAD HISTORY
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const orders = await api.getCompletedOrders();

      /*
       * Server dapat mengembalikan semua transaksi ketika user ADMIN.
       * Dashboard tetap hanya menampilkan transaksi milik user yang login.
       */
      const ownOrders = orders.filter(
        (order) => order.userId === currentUser.id
      );

      ownOrders.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
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

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------

  const totalRevenue = useMemo(
    () =>
      myOrders.reduce(
        (sum, order) => sum + Number(order.total || 0),
        0
      ),
    [myOrders]
  );

  // ---------------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------------

  const filteredOrders = useMemo(() => {
    const keyword = normalize(search);

    if (!keyword) return myOrders;

    return myOrders.filter((order) =>
      normalize(order.orderNumber).includes(keyword)
    );
  }, [myOrders, search]);

  // ---------------------------------------------------------------------------
  // ACCOUNT
  // ---------------------------------------------------------------------------

  function handleChangePassword() {
    router.push("/change-password");
  }

  function handleLogout() {
    Alert.alert(
      "Keluar",
      "Yakin ingin keluar dari akun ini?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
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
      ]
    );
  }

  // ---------------------------------------------------------------------------
  // REPRINT STRUK
  // ---------------------------------------------------------------------------

  function handleOpenPrint(order: Order) {
    try {
      const receiptOrder = toReceiptOrder(order);

      setPrintReceiptOrder(receiptOrder);
      setPrintModalVisible(true);
    } catch (err) {
      Alert.alert(
        "Gagal membuka struk",
        err instanceof Error
          ? err.message
          : "Data transaksi tidak dapat diproses."
      );
    }
  }

  function handleClosePrint() {
    setPrintModalVisible(false);
    setPrintReceiptOrder(null);
  }

  // ---------------------------------------------------------------------------
  // LOADING
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          {
            backgroundColor: colors.bg,
          },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  return (
    <>
      <ScrollView
        style={{
          backgroundColor: colors.bg,
        }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================================ */}
        {/* HEADER */}
        {/* ================================================================ */}

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.pageTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Dashboard
            </Text>

            <Text
              style={[
                styles.pageSubtitle,
                {
                  color: colors.subtext,
                },
              ]}
            >
              Ringkasan aktivitas akun kamu
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleRefresh}
            style={[
              styles.refreshButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>

        {/* ================================================================ */}
        {/* PROFILE CARD */}
        {/* ================================================================ */}

        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.avatarWrapper,
              {
                backgroundColor: colors.bg,
                borderColor: colors.border,
              },
            ]}
          >
            <Image
              source={{
                uri: `${API_URL}/Logo.webp`,
              }}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.profileInfo}>
            <View style={styles.profileTopRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.profileName,
                  {
                    color: colors.text,
                  },
                ]}
              >
                {currentUser?.name ?? "-"}
              </Text>

              <View
                style={[
                  styles.roleBadge,
                  {
                    backgroundColor:
                      currentUser?.role === "ADMIN"
                        ? colors.primary
                        : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.roleText,
                    {
                      color:
                        currentUser?.role === "ADMIN"
                          ? colors.bg
                          : colors.text,
                    },
                  ]}
                >
                  {currentUser?.role}
                </Text>
              </View>
            </View>

            <Text
              numberOfLines={1}
              style={[
                styles.profileUsername,
                {
                  color: colors.subtext,
                },
              ]}
            >
              @{currentUser?.username} • {currentUser?.email}
            </Text>
          </View>
        </View>

        {/* ================================================================ */}
        {/* ACCOUNT ACTIONS */}
        {/* ================================================================ */}

        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={handleChangePassword}
          >
            <Ionicons
              name="key-outline"
              size={17}
              color={colors.text}
            />

            <Text
              numberOfLines={1}
              style={[
                styles.actionText,
                {
                  color: colors.text,
                },
              ]}
            >
              Ganti Password
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.danger,
              },
            ]}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator
                color={colors.danger}
                size="small"
              />
            ) : (
              <>
                <Ionicons
                  name="log-out-outline"
                  size={17}
                  color={colors.danger}
                />

                <Text
                  numberOfLines={1}
                  style={[
                    styles.actionText,
                    {
                      color: colors.danger,
                    },
                  ]}
                >
                  Logout
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ================================================================ */}
        {/* SUMMARY */}
        {/* ================================================================ */}

        <Text
          style={[
            styles.sectionTitle,
            {
              color: colors.text,
            },
          ]}
        >
          Ringkasan Penjualan
        </Text>

        <View style={styles.summaryRow}>
          {/* Revenue */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                {
                  backgroundColor: colors.primary,
                },
              ]}
            >
              <Ionicons
                name="cash-outline"
                size={16}
                color={colors.bg}
              />
            </View>

            <View style={styles.summaryContent}>
              <Text
                numberOfLines={1}
                style={[
                  styles.summaryLabel,
                  {
                    color: colors.subtext,
                  },
                ]}
              >
                Pendapatan
              </Text>

              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.summaryValue,
                  {
                    color: colors.text,
                  },
                ]}
              >
                {formatCurrency(totalRevenue)}
              </Text>
            </View>
          </View>

          {/* Transaction */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                {
                  backgroundColor: colors.primary,
                },
              ]}
            >
              <Ionicons
                name="receipt-outline"
                size={16}
                color={colors.bg}
              />
            </View>

            <View style={styles.summaryContent}>
              <Text
                numberOfLines={1}
                style={[
                  styles.summaryLabel,
                  {
                    color: colors.subtext,
                  },
                ]}
              >
                Transaksi
              </Text>

              <Text
                numberOfLines={1}
                style={[
                  styles.summaryValue,
                  {
                    color: colors.text,
                  },
                ]}
              >
                {myOrders.length}
              </Text>
            </View>
          </View>
        </View>

        {/* ================================================================ */}
        {/* HISTORY HEADER */}
        {/* ================================================================ */}

        <View style={styles.historyHeader}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: colors.text,
                  marginTop: 0,
                  marginBottom: 2,
                },
              ]}
            >
              History Transaksi
            </Text>

            <Text
              style={[
                styles.historySubtitle,
                {
                  color: colors.subtext,
                },
              ]}
            >
              Tap transaksi untuk cetak ulang struk
            </Text>
          </View>

          <View
            style={[
              styles.countBadge,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.countText,
                {
                  color: colors.text,
                },
              ]}
            >
              {filteredOrders.length}
            </Text>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SEARCH */}
        {/* ================================================================ */}

        <View
          style={[
            styles.searchWrapper,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={17}
            color={colors.subtext}
          />

          <TextInput
            placeholder="Cari nomor pesanan..."
            placeholderTextColor={colors.subtext}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.searchInput,
              {
                color: colors.text,
              },
            ]}
            returnKeyType="search"
          />

          {search.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSearch("")}
            >
              <Ionicons
                name="close-circle"
                size={17}
                color={colors.subtext}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* ================================================================ */}
        {/* EMPTY */}
        {/* ================================================================ */}

        {filteredOrders.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: colors.bg,
                },
              ]}
            >
              <Ionicons
                name="receipt-outline"
                size={24}
                color={colors.subtext}
              />
            </View>

            <Text
              style={[
                styles.emptyTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Belum ada transaksi
            </Text>

            <Text
              style={[
                styles.emptyText,
                {
                  color: colors.subtext,
                },
              ]}
            >
              {search
                ? `Tidak ada transaksi dengan nomor "${search}".`
                : "Belum ada transaksi yang selesai."}
            </Text>
          </View>
        ) : (
          /* ============================================================ */
          /* HISTORY LIST */
          /* ============================================================ */

          <View style={styles.historyList}>
            {filteredOrders.map((order) => {
              const paymentIcon =
                order.paymentMethod === "QRIS"
                  ? "qr-code-outline"
                  : "cash-outline";

              const orderDate = order.completedAt
                ? formatDate(order.completedAt)
                : formatDate(order.createdAt);

              return (
                <TouchableOpacity
                  key={order.id}
                  activeOpacity={0.75}
                  onPress={() => handleOpenPrint(order)}
                  style={[
                    styles.historyRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {/* LEFT */}
                  <View style={styles.historyMain}>
                    <View style={styles.orderNumberRow}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.orderNumber,
                          {
                            color: colors.text,
                          },
                        ]}
                      >
                        {order.orderNumber}
                      </Text>

                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor: "#16a34a",
                          },
                        ]}
                      >
                        <View style={styles.statusDot} />

                        <Text style={styles.statusPillText}>
                          SELESAI
                        </Text>
                      </View>
                    </View>

                    <View style={styles.historyMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="time-outline"
                          size={12}
                          color={colors.subtext}
                        />

                        <Text
                          numberOfLines={1}
                          style={[
                            styles.metaText,
                            {
                              color: colors.subtext,
                            },
                          ]}
                        >
                          {orderDate}
                        </Text>
                      </View>

                      <View style={styles.metaItem}>
                        <Ionicons
                          name={paymentIcon}
                          size={12}
                          color={colors.subtext}
                        />

                        <Text
                          numberOfLines={1}
                          style={[
                            styles.metaText,
                            {
                              color: colors.subtext,
                            },
                          ]}
                        >
                          {order.paymentMethod ?? "-"}
                        </Text>
                      </View>

                      <View style={styles.metaItem}>
                        <Ionicons
                          name="cube-outline"
                          size={12}
                          color={colors.subtext}
                        />

                        <Text
                          numberOfLines={1}
                          style={[
                            styles.metaText,
                            {
                              color: colors.subtext,
                            },
                          ]}
                        >
                          {order.items.length} item
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* RIGHT */}
                  <View style={styles.historyRight}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[
                        styles.historyTotal,
                        {
                          color: colors.text,
                        },
                      ]}
                    >
                      {formatCurrency(order.total)}
                    </Text>

                    <View style={styles.printRow}>
                      <Ionicons
                        name="print-outline"
                        size={12}
                        color={colors.primary}
                      />

                      <Text
                        style={[
                          styles.printText,
                          {
                            color: colors.primary,
                          },
                        ]}
                      >
                        Cetak
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={colors.subtext}
                    style={styles.chevron}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ================================================================ */}
      {/* PRINT RECEIPT MODAL */}
      {/* ================================================================ */}

      <PrintReceiptModal
        visible={printModalVisible}
        receiptOrder={printReceiptOrder}
        onClose={handleClosePrint}
      />
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  content: {
    padding: 14,
    paddingBottom: 40,
  },

  // --------------------------------------------------------------------------
  // HEADER
  // --------------------------------------------------------------------------

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  pageTitle: {
    fontSize: 23,
    fontWeight: "800",
  },

  pageSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  // --------------------------------------------------------------------------
  // PROFILE
  // --------------------------------------------------------------------------

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },

  avatarWrapper: {
    width: 46,
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
  },

  avatarImage: {
    width: 30,
    height: 30,
  },

  profileInfo: {
    flex: 1,
    minWidth: 0,
  },

  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  profileName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },

  profileUsername: {
    fontSize: 11,
    marginTop: 3,
  },

  roleBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 8,
  },

  roleText: {
    fontSize: 9,
    fontWeight: "800",
  },

  // --------------------------------------------------------------------------
  // ACCOUNT ACTIONS
  // --------------------------------------------------------------------------

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 9,
  },

  actionBtn: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
  },

  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // --------------------------------------------------------------------------
  // SECTION
  // --------------------------------------------------------------------------

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 17,
    marginBottom: 9,
  },

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------

  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },

  summaryCard: {
    flex: 1,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  summaryContent: {
    flex: 1,
    minWidth: 0,
  },

  summaryLabel: {
    fontSize: 10,
    fontWeight: "500",
  },

  summaryValue: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  // --------------------------------------------------------------------------
  // HISTORY HEADER
  // --------------------------------------------------------------------------

  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 9,
  },

  historySubtitle: {
    fontSize: 10,
  },

  countBadge: {
    minWidth: 28,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  countText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // --------------------------------------------------------------------------
  // SEARCH
  // --------------------------------------------------------------------------

  searchWrapper: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    marginBottom: 9,
  },

  searchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },

  // --------------------------------------------------------------------------
  // HISTORY
  // --------------------------------------------------------------------------

  historyList: {
    gap: 7,
  },

  historyRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  historyMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 7,
  },

  orderNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  orderNumber: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 6,
  },

  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#fff",
    marginRight: 3,
  },

  statusPillText: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "800",
  },

  historyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
  },

  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  metaText: {
    fontSize: 9,
    marginLeft: 3,
  },

  historyRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 85,
    maxWidth: 120,
  },

  historyTotal: {
    fontSize: 12,
    fontWeight: "800",
  },

  printRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },

  printText: {
    fontSize: 9,
    fontWeight: "600",
    marginLeft: 3,
  },

  chevron: {
    marginLeft: 6,
  },

  // --------------------------------------------------------------------------
  // EMPTY
  // --------------------------------------------------------------------------

  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: "center",
  },

  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },

  emptyText: {
    fontSize: 11,
    marginTop: 3,
    textAlign: "center",
  },
});