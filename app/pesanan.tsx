import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, type Menu, type MenuVariant, type Order } from "@/lib/api";
import { API_URL } from "@/lib/auth-client";
import { useThemeColors } from "@/hooks/use-theme-colors";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function normalize(text: string) {
  return text.trim().toLowerCase();
}

interface CartItem {
  menuId: string;
  menuVariantId: string;
  menuName: string;
  variantName: string;
  price: number;
  qty: number;
}

type CartMap = Record<string, CartItem>;

export default function PesananScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  const isEditing = !!orderId;

  const [menus, setMenus] = useState<Menu[]>([]);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [cart, setCart] = useState<CartMap>({});

  const [notes, setNotes] = useState("");
  const [discountInput, setDiscountInput] = useState("0");
  const [taxInput, setTaxInput] = useState("0");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);

  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);

  const [payMethod, setPayMethod] = useState<"CASH" | "QRIS">("CASH");
  const [paidAmountInput, setPaidAmountInput] = useState("");

  /*
  |--------------------------------------------------------------------------
  | LOAD DATA
  |--------------------------------------------------------------------------
  */

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const menuData = await api.getMenus();
      setMenus(menuData);

      if (orderId) {
        const orderData = await api.getOrderById(orderId);

        setExistingOrder(orderData);
        setNotes(orderData.notes ?? "");
        setDiscountInput(String(orderData.discount ?? 0));
        setTaxInput(String(orderData.tax ?? 0));

        const initialCart: CartMap = {};

        for (const item of orderData.items) {
          initialCart[item.menuVariantId] = {
            menuId: item.menuId,
            menuVariantId: item.menuVariantId,
            menuName: item.menuName,
            variantName: item.variantName,
            price: item.unitPrice,
            qty: item.quantity,
          };
        }

        setCart(initialCart);
      }
    } catch (err) {
      Alert.alert(
        "Gagal memuat pesanan",
        err instanceof Error ? err.message : "Terjadi kesalahan"
      );

      router.back();
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    load();
  }, [load]);

  /*
  |--------------------------------------------------------------------------
  | FILTER MENU
  |--------------------------------------------------------------------------
  */

  const orderableMenus = useMemo(() => {
    return menus
      .filter((menu) => menu.available)
      .map((menu) => ({
        ...menu,
        menuVariants: menu.menuVariants.filter((v) => v.available),
      }))
      .filter((menu) => menu.menuVariants.length > 0);
  }, [menus]);

  const filteredMenus = useMemo(() => {
    const keyword = normalize(search);

    if (!keyword) {
      return orderableMenus;
    }

    return orderableMenus.filter((menu) =>
      normalize(menu.name).includes(keyword)
    );
  }, [orderableMenus, search]);

  /*
  |--------------------------------------------------------------------------
  | CART ACTIONS
  |--------------------------------------------------------------------------
  */

  function addToCart(menu: Menu, variant: MenuVariant) {
    setCart((prev) => {
      const existing = prev[variant.id];

      return {
        ...prev,
        [variant.id]: {
          menuId: menu.id,
          menuVariantId: variant.id,
          menuName: menu.name,
          variantName: variant.variant.name,
          price: variant.price,
          qty: (existing?.qty ?? 0) + 1,
        },
      };
    });
  }

  function decreaseFromCart(variantId: string) {
    setCart((prev) => {
      const existing = prev[variantId];

      if (!existing) {
        return prev;
      }

      const next = { ...prev };

      if (existing.qty > 1) {
        next[variantId] = {
          ...existing,
          qty: existing.qty - 1,
        };
      } else {
        delete next[variantId];
      }

      return next;
    });
  }

  function increaseInCart(variantId: string) {
    setCart((prev) => {
      const existing = prev[variantId];

      if (!existing) {
        return prev;
      }

      return {
        ...prev,
        [variantId]: {
          ...existing,
          qty: existing.qty + 1,
        },
      };
    });
  }

  function removeFromCart(variantId: string) {
    setCart((prev) => {
      const next = { ...prev };

      delete next[variantId];

      return next;
    });
  }

  /*
  |--------------------------------------------------------------------------
  | CART CALCULATION
  |--------------------------------------------------------------------------
  */

  const cartItems = useMemo(() => {
    return Object.values(cart);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.qty, 0);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + item.price * item.qty,
      0
    );
  }, [cartItems]);

  const discount = Math.max(0, Number(discountInput) || 0);
  const tax = Math.max(0, Number(taxInput) || 0);

  const total = Math.max(0, subtotal - discount + tax);

  /*
  |--------------------------------------------------------------------------
  | DETEKSI PERUBAHAN
  |--------------------------------------------------------------------------
  */

  const isDirty = useMemo(() => {
    if (!existingOrder) {
      return false;
    }

    if (existingOrder.items.length !== cartItems.length) {
      return true;
    }

    if (existingOrder.discount !== discount) {
      return true;
    }

    if (existingOrder.tax !== tax) {
      return true;
    }

    return cartItems.some((item) => {
      const original = existingOrder.items.find(
        (o) => o.menuVariantId === item.menuVariantId
      );

      return !original || original.quantity !== item.qty;
    });
  }, [existingOrder, cartItems, discount, tax]);

  /*
  |--------------------------------------------------------------------------
  | CREATE ORDER
  |--------------------------------------------------------------------------
  */

  async function handleSubmitNewOrder() {
    if (cartItems.length === 0) {
      Alert.alert(
        "Keranjang kosong",
        "Tambahkan minimal 1 menu."
      );

      return;
    }

    setSaving(true);

    try {
      await api.createOrder({
        items: cartItems.map((item) => ({
          menuId: item.menuId,
          menuVariantId: item.menuVariantId,
          quantity: item.qty,
        })),
        discount,
        tax,
        notes: notes.trim() || undefined,
      });

      Alert.alert(
        "Berhasil",
        "Pesanan berhasil dibuat.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/"),
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        "Gagal",
        err instanceof Error
          ? err.message
          : "Gagal membuat pesanan"
      );
    } finally {
      setSaving(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | UPDATE ORDER
  |--------------------------------------------------------------------------
  */

  async function handleSaveChanges() {
    if (!existingOrder) {
      return;
    }

    if (cartItems.length === 0) {
      Alert.alert(
        "Keranjang kosong",
        "Pesanan harus memiliki minimal 1 menu."
      );

      return;
    }

    setSaving(true);

    try {
      await api.updateOrder(existingOrder.id, {
        items: cartItems.map((item) => ({
          menuId: item.menuId,
          menuVariantId: item.menuVariantId,
          quantity: item.qty,
        })),
        discount,
        tax,
        notes: notes.trim() || undefined,
      });

      await load();

      Alert.alert(
        "Berhasil",
        "Perubahan pesanan disimpan."
      );
    } catch (err) {
      Alert.alert(
        "Gagal",
        err instanceof Error
          ? err.message
          : "Gagal menyimpan perubahan"
      );
    } finally {
      setSaving(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CANCEL ORDER
  |--------------------------------------------------------------------------
  */

  function handleCancelOrder() {
    if (!existingOrder) {
      return;
    }

    Alert.alert(
      "Batalkan Pesanan",
      "Yakin ingin membatalkan pesanan ini?",
      [
        {
          text: "Tidak",
          style: "cancel",
        },
        {
          text: "Ya, Batalkan",
          style: "destructive",
          onPress: async () => {
            setSaving(true);

            try {
              await api.cancelOrder(existingOrder.id);

              router.replace("/");
            } catch (err) {
              Alert.alert(
                "Gagal",
                err instanceof Error
                  ? err.message
                  : "Gagal membatalkan pesanan"
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PAYMENT
  |--------------------------------------------------------------------------
  */

  function openPayModal() {
    if (!existingOrder) {
      return;
    }

    if (isDirty) {
      Alert.alert(
        "Simpan perubahan dulu",
        "Ada perubahan yang belum disimpan. Simpan perubahan sebelum melanjutkan pembayaran."
      );

      return;
    }

    setPayMethod("CASH");
    setPaidAmountInput(String(existingOrder.total));

    setCartSheetVisible(false);
    setPayModalVisible(true);
  }

  async function handleConfirmPayment() {
    if (!existingOrder) {
      return;
    }

    setPaying(true);

    try {
      if (payMethod === "CASH") {
        const paidAmount = Number(paidAmountInput);

        if (
          !Number.isFinite(paidAmount) ||
          paidAmount < existingOrder.total
        ) {
          Alert.alert(
            "Jumlah tidak valid",
            "Jumlah bayar kurang dari total pesanan."
          );

          setPaying(false);

          return;
        }

        const result = await api.payOrder(
          existingOrder.id,
          {
            method: "CASH",
            paidAmount,
          }
        );

        setPayModalVisible(false);

        Alert.alert(
          "Pembayaran Berhasil",
          `Kembalian: ${formatCurrency(
            result.changeAmount ?? 0
          )}`,
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ]
        );
      } else {
        await api.payOrder(
          existingOrder.id,
          {
            method: "QRIS",
          }
        );

        setPayModalVisible(false);

        Alert.alert(
          "Berhasil",
          "Pembayaran QRIS berhasil dikonfirmasi.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ]
        );
      }
    } catch (err) {
      Alert.alert(
        "Gagal",
        err instanceof Error
          ? err.message
          : "Gagal memproses pembayaran"
      );
    } finally {
      setPaying(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

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

  /*
  |--------------------------------------------------------------------------
  | CHANGE
  |--------------------------------------------------------------------------
  */

  const change =
    payMethod === "CASH" && existingOrder
      ? Number(paidAmountInput) - existingOrder.total
      : 0;

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
        },
      ]}
    >
      {/* ================================================================ */}
      {/* HEADER */}
      {/* ================================================================ */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
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
          {isEditing
            ? existingOrder?.orderNumber ?? "Pesanan"
            : "Pesanan Baru"}
        </Text>

        <View style={{ width: 24 }} />
      </View>

      {/* ================================================================ */}
      {/* SEARCH */}
      {/* ================================================================ */}

      <View style={styles.searchSection}>
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
            size={18}
            color={colors.subtext}
          />

          <TextInput
            placeholder="Cari nama menu..."
            placeholderTextColor={colors.subtext}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.searchInput,
              {
                color: colors.text,
              },
            ]}
          />

          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.subtext}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ================================================================ */}
      {/* MENU LIST */}
      {/* ================================================================ */}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              cartCount > 0
                ? 110 + insets.bottom
                : 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {filteredMenus.length === 0 ? (
          <View style={styles.emptyMenuState}>
            <Ionicons
              name="search-outline"
              size={32}
              color={colors.subtext}
            />

            <Text
              style={{
                color: colors.subtext,
                marginTop: 8,
              }}
            >
              {search
                ? `Tidak ada menu bernama "${search}".`
                : "Belum ada menu yang bisa dipesan."}
            </Text>
          </View>
        ) : (
          filteredMenus.map((menu) => (
            <View
              key={menu.id}
              style={[
                styles.menuCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* MENU HEADER */}

              <View style={styles.menuCardHeader}>
                {menu.imageUrl ? (
                  <Image
                    source={{
                      uri: menu.imageUrl,
                    }}
                    style={styles.menuThumb}
                  />
                ) : (
                  <View
                    style={[
                      styles.menuThumb,
                      styles.menuThumbPlaceholder,
                      {
                        backgroundColor: colors.bg,
                      },
                    ]}
                  >
                    <Ionicons
                      name="fast-food-outline"
                      size={20}
                      color={colors.subtext}
                    />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.menuName,
                      {
                        color: colors.text,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {menu.name}
                  </Text>

                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: 12,
                    }}
                    numberOfLines={1}
                  >
                    {menu.category?.name}
                  </Text>
                </View>
              </View>

              {/* VARIANTS */}

              {menu.menuVariants
                .sort(
                  (a, b) =>
                    a.sortOrder - b.sortOrder
                )
                .map((variant) => {
                  const inCart = cart[variant.id];

                  return (
                    <View
                      key={variant.id}
                      style={[
                        styles.variantRow,
                        {
                          borderTopColor:
                            colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          flex: 1,
                        }}
                      >
                        {variant.variant.name}
                      </Text>

                      <Text
                        style={{
                          color: colors.subtext,
                          marginRight: 12,
                        }}
                      >
                        {formatCurrency(
                          variant.price
                        )}
                      </Text>

                      {inCart ? (
                        <View
                          style={styles.qtyControl}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              decreaseFromCart(
                                variant.id
                              )
                            }
                          >
                            <Ionicons
                              name="remove-circle"
                              size={24}
                              color={colors.danger}
                            />
                          </TouchableOpacity>

                          <Text
                            style={{
                              color: colors.text,
                              minWidth: 22,
                              textAlign: "center",
                              fontWeight: "700",
                            }}
                          >
                            {inCart.qty}
                          </Text>

                          <TouchableOpacity
                            onPress={() =>
                              addToCart(
                                menu,
                                variant
                              )
                            }
                          >
                            <Ionicons
                              name="add-circle"
                              size={24}
                              color={colors.primary}
                            />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.addBtn,
                            {
                              backgroundColor:
                                colors.primary,
                            },
                          ]}
                          onPress={() =>
                            addToCart(
                              menu,
                              variant
                            )
                          }
                        >
                          <Ionicons
                            name="add"
                            size={16}
                            color={colors.bg}
                          />

                          <Text
                            style={{
                              color: colors.bg,
                              fontSize: 12,
                              fontWeight: "700",
                            }}
                          >
                            Tambah
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
            </View>
          ))
        )}
      </ScrollView>

      {/* ================================================================ */}
      {/* FLOATING CART */}
      {/* ================================================================ */}

      {cartCount > 0 && (
        <TouchableOpacity
          style={[
            styles.cartPill,
            {
              backgroundColor: colors.primary,
              bottom: Math.max(
                insets.bottom,
                16
              ),
            },
          ]}
          onPress={() =>
            setCartSheetVisible(true)
          }
          activeOpacity={0.9}
        >
          <View style={styles.cartPillBadge}>
            <Text
              style={
                styles.cartPillBadgeText
              }
            >
              {cartCount}
            </Text>
          </View>

          <Text style={styles.cartPillLabel}>
            Lihat Pesanan
          </Text>

          <Text style={styles.cartPillTotal}>
            {formatCurrency(total)}
          </Text>
        </TouchableOpacity>
      )}

      {/* ================================================================ */}
      {/* CART SHEET */}
      {/* ================================================================ */}

      <Modal
        visible={cartSheetVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() =>
          setCartSheetVisible(false)
        }
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : "height"
          }
        >
          <View
            style={[
              styles.cartSheet,
              {
                backgroundColor: colors.bg,
                paddingBottom:
                  insets.bottom,
              },
            ]}
          >
            {/* HANDLE */}

            <View style={styles.handleWrapper}>
              <View
                style={[
                  styles.handle,
                  {
                    backgroundColor:
                      colors.subtext,
                  },
                ]}
              />
            </View>

            {/* HEADER */}

            <View
              style={[
                styles.cartSheetHeader,
                {
                  borderBottomColor:
                    colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.cartSheetTitle,
                  {
                    color: colors.text,
                  },
                ]}
              >
                Rincian Pesanan
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setCartSheetVisible(false)
                }
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* CONTENT */}

            <ScrollView
              style={styles.cartSheetScroll}
              contentContainerStyle={{
                paddingBottom: 8,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {/* CART ITEMS */}

              {cartItems.length === 0 ? (
                <Text
                  style={{
                    color: colors.subtext,
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  Keranjang masih kosong.
                </Text>
              ) : (
                cartItems.map((item) => (
                  <View
                    key={item.menuVariantId}
                    style={[
                      styles.cartRow,
                      {
                        borderBottomColor:
                          colors.border,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "600",
                        }}
                      >
                        {item.menuName}
                      </Text>

                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: 12,
                        }}
                      >
                        {item.variantName} •{" "}
                        {formatCurrency(
                          item.price
                        )}
                      </Text>
                    </View>

                    <View
                      style={styles.qtyControl}
                    >
                      <TouchableOpacity
                        onPress={() =>
                          decreaseFromCart(
                            item.menuVariantId
                          )
                        }
                      >
                        <Ionicons
                          name="remove-circle"
                          size={22}
                          color={colors.danger}
                        />
                      </TouchableOpacity>

                      <Text
                        style={{
                          color: colors.text,
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {item.qty}
                      </Text>

                      <TouchableOpacity
                        onPress={() =>
                          increaseInCart(
                            item.menuVariantId
                          )
                        }
                      >
                        <Ionicons
                          name="add-circle"
                          size={22}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>

                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        marginLeft: 12,
                        minWidth: 80,
                        textAlign: "right",
                      }}
                    >
                      {formatCurrency(
                        item.price *
                          item.qty
                      )}
                    </Text>

                    <TouchableOpacity
                      onPress={() =>
                        removeFromCart(
                          item.menuVariantId
                        )
                      }
                      style={{
                        marginLeft: 10,
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={colors.subtext}
                      />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* NOTES */}

              <View style={styles.formSection}>
                <Text
                  style={[
                    styles.formLabel,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  Catatan
                </Text>

                <TextInput
                  placeholder="Contoh: tanpa gula, less ice..."
                  placeholderTextColor={
                    colors.subtext
                  }
                  value={notes}
                  onChangeText={setNotes}
                  style={[
                    styles.notesInput,
                    {
                      borderColor:
                        colors.border,
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              {/* DISCOUNT & TAX */}

              <View
                style={[
                  styles.formSection,
                  {
                    flexDirection: "row",
                    gap: 12,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.formLabel,
                      {
                        color: colors.text,
                      },
                    ]}
                  >
                    Diskon
                  </Text>

                  <TextInput
                    keyboardType="numeric"
                    value={discountInput}
                    onChangeText={
                      setDiscountInput
                    }
                    placeholder="0"
                    placeholderTextColor={
                      colors.subtext
                    }
                    style={[
                      styles.numberInput,
                      {
                        borderColor:
                          colors.border,
                        color: colors.text,
                      },
                    ]}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.formLabel,
                      {
                        color: colors.text,
                      },
                    ]}
                  >
                    Pajak
                  </Text>

                  <TextInput
                    keyboardType="numeric"
                    value={taxInput}
                    onChangeText={setTaxInput}
                    placeholder="0"
                    placeholderTextColor={
                      colors.subtext
                    }
                    style={[
                      styles.numberInput,
                      {
                        borderColor:
                          colors.border,
                        color: colors.text,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* BREAKDOWN */}

              <View
                style={[
                  styles.breakdown,
                  {
                    borderTopColor:
                      colors.border,
                    backgroundColor:
                      colors.card,
                  },
                ]}
              >
                <View
                  style={styles.breakdownRow}
                >
                  <Text
                    style={{
                      color: colors.subtext,
                    }}
                  >
                    Subtotal
                  </Text>

                  <Text
                    style={{
                      color: colors.text,
                    }}
                  >
                    {formatCurrency(
                      subtotal
                    )}
                  </Text>
                </View>

                {discount > 0 && (
                  <View
                    style={
                      styles.breakdownRow
                    }
                  >
                    <Text
                      style={{
                        color: colors.subtext,
                      }}
                    >
                      Diskon
                    </Text>

                    <Text
                      style={{
                        color: colors.danger,
                      }}
                    >
                      -
                      {formatCurrency(
                        discount
                      )}
                    </Text>
                  </View>
                )}

                {tax > 0 && (
                  <View
                    style={
                      styles.breakdownRow
                    }
                  >
                    <Text
                      style={{
                        color: colors.subtext,
                      }}
                    >
                      Pajak
                    </Text>

                    <Text
                      style={{
                        color: colors.text,
                      }}
                    >
                      +
                      {formatCurrency(tax)}
                    </Text>
                  </View>
                )}

                <View
                  style={[
                    styles.breakdownRow,
                    {
                      marginTop: 6,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    Total
                  </Text>

                  <Text
                    style={{
                      color: colors.primary,
                      fontWeight: "800",
                      fontSize: 16,
                    }}
                  >
                    {formatCurrency(total)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* ACTIONS */}

            <View
              style={[
                styles.cartSheetActions,
                {
                  borderTopColor:
                    colors.border,
                  paddingBottom:
                    16 + insets.bottom,
                },
              ]}
            >
              {isEditing ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.smallBtn,
                      {
                        borderColor:
                          colors.danger,
                        borderWidth: 1,
                      },
                    ]}
                    onPress={
                      handleCancelOrder
                    }
                    disabled={
                      saving || paying
                    }
                  >
                    <Text
                      style={{
                        color: colors.danger,
                        fontWeight: "600",
                      }}
                    >
                      Batalkan
                    </Text>
                  </TouchableOpacity>

                  {isDirty ? (
                    <TouchableOpacity
                      style={[
                        styles.smallBtn,
                        {
                          backgroundColor:
                            colors.primary,
                          flex: 1,
                        },
                      ]}
                      onPress={
                        handleSaveChanges
                      }
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator
                          color={colors.bg}
                        />
                      ) : (
                        <Text
                          style={{
                            color: colors.bg,
                            fontWeight: "700",
                          }}
                        >
                          Simpan Perubahan
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.smallBtn,
                        {
                          backgroundColor:
                            colors.primary,
                          flex: 1,
                        },
                      ]}
                      onPress={
                        openPayModal
                      }
                      disabled={
                        saving || paying
                      }
                    >
                      <Text
                        style={{
                          color: colors.bg,
                          fontWeight: "700",
                        }}
                      >
                        Bayar Sekarang
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    {
                      backgroundColor:
                        colors.primary,
                      flex: 1,
                    },
                  ]}
                  onPress={
                    handleSubmitNewOrder
                  }
                  disabled={
                    saving ||
                    cartItems.length === 0
                  }
                >
                  {saving ? (
                    <ActivityIndicator
                      color={colors.bg}
                    />
                  ) : (
                    <Text
                      style={{
                        color: colors.bg,
                        fontWeight: "700",
                      }}
                    >
                      Buat Pesanan •{" "}
                      {formatCurrency(total)}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================================================================ */}
      {/* PAYMENT MODAL */}
      {/* ================================================================ */}

      <Modal
        visible={payModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() =>
          setPayModalVisible(false)
        }
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : "height"
          }
        >
          <ScrollView
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.bg,
              },
            ]}
            contentContainerStyle={{
              paddingBottom:
                insets.bottom + 20,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* HANDLE */}

            <View style={styles.handleWrapper}>
              <View
                style={[
                  styles.handle,
                  {
                    backgroundColor:
                      colors.subtext,
                  },
                ]}
              />
            </View>

            {/* TITLE */}

            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Pembayaran
            </Text>

            <Text
              style={{
                color: colors.subtext,
                marginBottom: 12,
              }}
            >
              Total:{" "}
              {formatCurrency(
                existingOrder?.total ?? 0
              )}
            </Text>

            {/* PAYMENT METHOD */}

            <View style={styles.methodRow}>
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  {
                    borderColor:
                      colors.border,
                    backgroundColor:
                      payMethod === "CASH"
                        ? colors.primary
                        : "transparent",
                  },
                ]}
                onPress={() =>
                  setPayMethod("CASH")
                }
              >
                <Text
                  style={{
                    color:
                      payMethod === "CASH"
                        ? colors.bg
                        : colors.text,
                  }}
                >
                  Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  {
                    borderColor:
                      colors.border,
                    backgroundColor:
                      payMethod === "QRIS"
                        ? colors.primary
                        : "transparent",
                  },
                ]}
                onPress={() =>
                  setPayMethod("QRIS")
                }
              >
                <Text
                  style={{
                    color:
                      payMethod === "QRIS"
                        ? colors.bg
                        : colors.text,
                  }}
                >
                  QRIS
                </Text>
              </TouchableOpacity>
            </View>

            {/* CASH */}

            {payMethod === "CASH" ? (
              <>
                <Text
                  style={{
                    color: colors.text,
                    marginTop: 12,
                    marginBottom: 4,
                  }}
                >
                  Jumlah Bayar
                </Text>

                <TextInput
                  keyboardType="numeric"
                  value={paidAmountInput}
                  onChangeText={
                    setPaidAmountInput
                  }
                  style={[
                    styles.input,
                    {
                      borderColor:
                        colors.border,
                      color: colors.text,
                    },
                  ]}
                />

                {change >= 0 && (
                  <Text
                    style={{
                      color: colors.subtext,
                      marginTop: 4,
                    }}
                  >
                    Kembalian:{" "}
                    {formatCurrency(change)}
                  </Text>
                )}
              </>
            ) : (
              /* QRIS */
              <Image
                source={{
                  uri: `${API_URL}/qris.webp`,
                }}
                style={styles.qrisImage}
                resizeMode="contain"
              />
            )}

            {/* BUTTONS */}

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 20,
              }}
            >
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    borderColor:
                      colors.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() =>
                  setPayModalVisible(false)
                }
                disabled={paying}
              >
                <Text
                  style={{
                    color: colors.text,
                  }}
                >
                  Batal
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor:
                      colors.primary,
                  },
                ]}
                onPress={
                  handleConfirmPayment
                }
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator
                    color={colors.bg}
                  />
                ) : (
                  <Text
                    style={{
                      color: colors.bg,
                      fontWeight: "600",
                    }}
                  >
                    Konfirmasi
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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

  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  scrollContent: {
    padding: 16,
  },

  emptyMenuState: {
    alignItems: "center",
    paddingVertical: 60,
  },

  menuCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },

  menuCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },

  menuThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },

  menuThumbPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },

  menuName: {
    fontSize: 15,
    fontWeight: "700",
  },

  variantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },

  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  cartPill: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,

    elevation: 6,
  },

  cartPillBadge: {
    backgroundColor:
      "rgba(36, 238, 154, 0.9)",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  cartPillBadgeText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 12,
  },

  cartPillLabel: {
    color: "#000",
    fontWeight: "600",
    flex: 1,
    marginLeft: 10,
  },

  cartPillTotal: {
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
  },

  /*
  |--------------------------------------------------------------------------
  | MODAL OVERLAY
  |--------------------------------------------------------------------------
  */

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },

  /*
  |--------------------------------------------------------------------------
  | CART SHEET
  |--------------------------------------------------------------------------
  */

  cartSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 16,

    elevation: 12,
  },

  cartSheetScroll: {
    flexShrink: 1,
  },

  handleWrapper: {
    alignItems: "center",
    paddingTop: 10,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },

  cartSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },

  cartSheetTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  /*
  |--------------------------------------------------------------------------
  | FORM
  |--------------------------------------------------------------------------
  */

  formSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },

  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },

  numberInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },

  /*
  |--------------------------------------------------------------------------
  | BREAKDOWN
  |--------------------------------------------------------------------------
  */

  breakdown: {
    marginTop: 16,
    marginHorizontal: 20,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderTopWidth: 0,
    gap: 6,
  },

  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  /*
  |--------------------------------------------------------------------------
  | CART ACTIONS
  |--------------------------------------------------------------------------
  */

  cartSheetActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },

  smallBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  /*
  |--------------------------------------------------------------------------
  | PAYMENT MODAL
  |--------------------------------------------------------------------------
  */

  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    maxHeight: "85%",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 4,
  },

  methodRow: {
    flexDirection: "row",
    gap: 10,
  },

  methodBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  qrisImage: {
    width: "100%",
    height: 240,
    marginTop: 12,
  },

  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
});