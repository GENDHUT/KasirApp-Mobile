import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type Menu, type Order } from "@/lib/api";
import {
  loadMenusWithFallback,
  getLocalOrders,
  type LocalOrder,
} from "@/lib/offline-storage";
import { syncAllLocalOrders, syncSingleLocalOrder } from "@/lib/sync";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { MenuDetailModal } from "@/components/menu/menu-detail-modal";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function getPriceRange(menu: Menu) {
  const activePrices = menu.menuVariants
    .filter((v) => v.available)
    .map((v) => v.price);

  if (activePrices.length === 0) return null;

  const min = Math.min(...activePrices);
  const max = Math.max(...activePrices);

  return min === max
    ? formatCurrency(min)
    : `${formatCurrency(min)} - ${formatCurrency(max)}`;
}

interface CategorySection {
  title: string;
  categoryId: string;
  data: Menu[][];
}

export default function MenuScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { isOnline } = useNetworkStatus();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuOffline, setMenuOffline] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [localOrders, setLocalOrders] = useState<LocalOrder[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);

  const load = useCallback(async () => {
    const { menus: menuData, offline } = await loadMenusWithFallback();
    setMenus(menuData);
    setMenuOffline(offline);

    try {
      const pending = await api.getPendingOrders();
      setPendingOrders(pending);
    } catch {
      setPendingOrders([]);
    }

    try {
      const local = await getLocalOrders();
      setLocalOrders(local);
    } catch {
      setLocalOrders([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    load();
  }

  function handleBuatPesanan() {
    router.push("/pesanan");
  }

  function handleLanjutkanPesanan(orderId: string) {
    router.push(`/pesanan?orderId=${orderId}`);
  }

  /*
  |--------------------------------------------------------------------------
  | SYNC HANDLERS
  |--------------------------------------------------------------------------
  */

  const unsyncedLocalOrders = useMemo(
    () => localOrders.filter((o) => o.status === "COMPLETED" && !o.synced),
    [localOrders]
  );

  const localPendingOrders = useMemo(
    () => localOrders.filter((o) => o.status === "PENDING"),
    [localOrders]
  );

  async function handleSyncAll() {
    setSyncing(true);
    const result = await syncAllLocalOrders();
    setSyncing(false);
    await load();

    if (result.syncedCount === 0 && result.failedCount === 0) {
      return;
    }

    if (result.failedCount === 0) {
      Alert.alert(
        "Sinkronisasi Berhasil",
        `${result.syncedCount} pesanan berhasil disinkronkan ke server.`
      );
    } else {
      Alert.alert(
        "Sinkronisasi Sebagian Berhasil",
        `${result.syncedCount} berhasil, ${result.failedCount} gagal.\n\n` +
          result.errors.map((e) => `${e.orderNumber}: ${e.message}`).join("\n")
      );
    }
  }

  function handleTapUnsyncedOrder(order: LocalOrder) {
    Alert.alert(
      order.orderNumber,
      `Total: ${formatCurrency(order.total)}\n` +
        `Dibayar: ${formatCurrency(order.paidAmount)} (${order.paymentMethod})\n` +
        `Kembalian: ${formatCurrency(order.changeAmount)}\n\n` +
        `Pesanan ini sudah dibayar secara offline dan menunggu disinkronkan ke server.`,
      [
        { text: "Tutup", style: "cancel" },
        {
          text: "Sync Sekarang",
          onPress: async () => {
            setSyncing(true);
            const result = await syncSingleLocalOrder(order.localId);
            setSyncing(false);
            await load();

            if (result.success) {
              Alert.alert("Berhasil", "Pesanan berhasil disinkronkan.");
            } else {
              Alert.alert("Gagal", result.error ?? "Gagal sinkronisasi.");
            }
          },
        },
      ]
    );
  }

  /*
  |--------------------------------------------------------------------------
  | GROUP MENU PER CATEGORY
  |--------------------------------------------------------------------------
  */

  const sections = useMemo<CategorySection[]>(() => {
    const availableMenus = menus.filter((m) => m.available);
    const groups = new Map<string, CategorySection>();

    for (const menu of availableMenus) {
      const categoryId = menu.category?.id ?? "uncategorized";
      const categoryName = menu.category?.name ?? "Lainnya";

      const existing = groups.get(categoryId);

      if (existing) {
        existing.data[0].push(menu);
      } else {
        groups.set(categoryId, {
          title: categoryName,
          categoryId,
          data: [[menu]],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }, [menus]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <SectionList
        sections={sections}
        keyExtractor={(_, index) => `section-row-${index}`}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <View>
            {(!isOnline || menuOffline) && (
              <View
                style={[
                  styles.offlineBanner,
                  { backgroundColor: "#fef3c7", borderColor: "#f59e0b" },
                ]}
              >
                <Ionicons name="cloud-offline-outline" size={16} color="#b45309" />
                <Text style={styles.offlineBannerText}>
                  Mode offline — menampilkan data tersimpan. Pesanan baru akan
                  disimpan di perangkat ini.
                </Text>
              </View>
            )}

            <View style={styles.pageHeader}>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Menu</Text>
                <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>
                  {menus.filter((m) => m.available).length} menu tersedia
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.createOrderBtn, { backgroundColor: colors.primary }]}
                onPress={handleBuatPesanan}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
                <Text style={[styles.createOrderText, { color: colors.bg }]}>
                  Buat Pesanan
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.bg }]}>
            <View style={[styles.sectionDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionCount, { color: colors.subtext }]}>
              {section.data[0].length} item
            </Text>
          </View>
        )}
        renderItem={({ item: menusInCategory }) => (
          <View style={styles.grid}>
            {menusInCategory.map((menu) => {
              const priceRange = getPriceRange(menu);
              const hasActiveVariant = menu.menuVariants.some((v) => v.available);

              return (
                <TouchableOpacity
                  key={menu.id}
                  activeOpacity={0.8}
                  style={[
                    styles.menuCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setSelectedMenu(menu)}
                >
                  <View style={styles.imageWrapper}>
                    {menu.imageUrl ? (
                      <Image source={{ uri: menu.imageUrl }} style={styles.menuImage} />
                    ) : (
                      <View
                        style={[
                          styles.menuImage,
                          styles.menuImagePlaceholder,
                          { backgroundColor: colors.bg },
                        ]}
                      >
                        <Ionicons
                          name="fast-food-outline"
                          size={26}
                          color={colors.subtext}
                        />
                      </View>
                    )}

                    {!hasActiveVariant && (
                      <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                        <Text style={styles.badgeText}>Habis</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.menuBody}>
                    <Text
                      style={[styles.menuName, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {menu.name}
                    </Text>

                    {priceRange ? (
                      <Text style={[styles.menuPrice, { color: colors.primary }]}>
                        {priceRange}
                      </Text>
                    ) : (
                      <Text style={[styles.menuPrice, { color: colors.danger }]}>
                        Belum ada harga
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.subtext, textAlign: "center", marginTop: 40 }}>
            Belum ada menu tersedia.
          </Text>
        }
        ListFooterComponent={
          <View style={styles.pendingSection}>
            <View style={styles.pendingHeader}>
              <View>
                <Text style={[styles.sectionTitleFooter, { color: colors.text }]}>
                  Pesanan Pending
                </Text>
                <Text style={[styles.pendingSubtitle, { color: colors.subtext }]}>
                  Selesaikan pembayaran untuk pesanan yang belum lunas.
                </Text>
              </View>

              {unsyncedLocalOrders.length > 0 && (
                <TouchableOpacity
                  style={[styles.syncBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSyncAll}
                  disabled={syncing}
                >
                  {syncing ? (
                    <ActivityIndicator color={colors.bg} size="small" />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={15} color={colors.bg} />
                      <Text style={styles.syncBtnText}>
                        Sync ({unsyncedLocalOrders.length})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {pendingOrders.length === 0 &&
            localPendingOrders.length === 0 &&
            unsyncedLocalOrders.length === 0 ? (
              <View
                style={[
                  styles.emptyPending,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: colors.subtext }}>
                  Tidak ada pesanan pending.
                </Text>
              </View>
            ) : (
              <>
                {/* Server pending orders */}
                {pendingOrders.map((order) => (
                  <TouchableOpacity
                    key={`server-${order.id}`}
                    style={[
                      styles.pendingRow,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    onPress={() => handleLanjutkanPesanan(order.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "600" }}>
                        {order.orderNumber}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                        {order.items.length} item • {order.user?.name}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {formatCurrency(order.total)}
                      </Text>
                      <Text style={{ color: colors.primary, fontSize: 12, marginTop: 2 }}>
                        Bayar →
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Local pending orders (offline, belum dibayar) */}
                {localPendingOrders.map((order) => (
                  <TouchableOpacity
                    key={`local-pending-${order.localId}`}
                    style={[
                      styles.pendingRow,
                      { backgroundColor: colors.card, borderColor: "#f59e0b" },
                    ]}
                    onPress={() => handleLanjutkanPesanan(order.localId)}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>
                          {order.orderNumber}
                        </Text>
                        <View style={styles.offlineTag}>
                          <Text style={styles.offlineTagText}>OFFLINE</Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                        {order.items.length} item
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {formatCurrency(order.total)}
                      </Text>
                      <Text style={{ color: "#f59e0b", fontSize: 12, marginTop: 2 }}>
                        Bayar →
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Local completed, belum sync */}
                {unsyncedLocalOrders.map((order) => (
                  <TouchableOpacity
                    key={`local-unsynced-${order.localId}`}
                    style={[
                      styles.pendingRow,
                      { backgroundColor: colors.card, borderColor: "#16a34a" },
                    ]}
                    onPress={() => handleTapUnsyncedOrder(order)}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>
                          {order.orderNumber}
                        </Text>
                        <View style={[styles.offlineTag, { backgroundColor: "#16a34a" }]}>
                          <Text style={styles.offlineTagText}>MENUNGGU SYNC</Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                        Sudah dibayar • {order.items.length} item
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {formatCurrency(order.total)}
                      </Text>
                      <Ionicons name="cloud-upload-outline" size={16} color="#16a34a" />
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        }
      />

      <MenuDetailModal
        menu={selectedMenu}
        visible={!!selectedMenu}
        onClose={() => setSelectedMenu(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { paddingBottom: 32 },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
  },
  offlineBannerText: { color: "#b45309", fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 16 },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: "700" },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  createOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  createOrderText: { fontWeight: "600", fontSize: 13 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 8,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  sectionCount: { fontSize: 12 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 12,
  },
  menuCard: {
    width: "47%",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  imageWrapper: { position: "relative" },
  menuImage: { width: "100%", height: 120 },
  menuImagePlaceholder: { justifyContent: "center", alignItems: "center" },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { color: "#000", fontSize: 10, fontWeight: "700" },
  menuBody: { padding: 12, gap: 4 },
  menuName: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  menuPrice: { fontSize: 13, fontWeight: "700" },
  pendingSection: { marginTop: 24, paddingHorizontal: 16 },
  pendingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  sectionTitleFooter: { fontSize: 16, fontWeight: "700" },
  pendingSubtitle: { fontSize: 12, marginTop: 2 },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  syncBtnText: { color: "#000", fontSize: 12, fontWeight: "700" },
  emptyPending: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  pendingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  offlineTag: {
    backgroundColor: "#f59e0b",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  offlineTagText: { color: "#fff", fontSize: 9, fontWeight: "800" },
});