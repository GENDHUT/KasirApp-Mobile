import {
  View,
  Text,
  Modal,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { Menu } from "@/lib/api";
import { useThemeColors } from "@/hooks/use-theme-colors";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

interface MenuDetailModalProps {
  menu: Menu | null;
  visible: boolean;
  onClose: () => void;
}

export function MenuDetailModal({ menu, visible, onClose }: MenuDetailModalProps) {
  const colors = useThemeColors();

  if (!menu) return null;

  const sortedVariants = [...menu.menuVariants].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          {/* Drag handle */}
          <View style={styles.handleWrapper}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Image */}
            {menu.imageUrl ? (
              <Image source={{ uri: menu.imageUrl }} style={styles.image} />
            ) : (
              <View
                style={[
                  styles.image,
                  styles.imagePlaceholder,
                  { backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="fast-food-outline" size={48} color={colors.subtext} />
              </View>
            )}

            {/* Close button (floating) */}
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.bg }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>

            {/* Status badge */}
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: menu.available ? "#16a34a" : colors.danger,
                },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {menu.available ? "Tersedia" : "Tidak Tersedia"}
              </Text>
            </View>

            <View style={styles.body}>
              {/* Category */}
              <Text style={[styles.category, { color: colors.primary }]}>
                {menu.category?.name?.toUpperCase()}
              </Text>

              {/* Name */}
              <Text style={[styles.name, { color: colors.text }]}>{menu.name}</Text>

              {/* Description */}
              {menu.description ? (
                <Text style={[styles.description, { color: colors.subtext }]}>
                  {menu.description}
                </Text>
              ) : (
                <Text style={[styles.description, { color: colors.subtext, fontStyle: "italic" }]}>
                  Tidak ada deskripsi untuk menu ini.
                </Text>
              )}

              {/* Divider */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Variants */}
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                Pilihan Variant
              </Text>

              {sortedVariants.length === 0 ? (
                <Text style={{ color: colors.subtext, marginTop: 8 }}>
                  Belum ada variant untuk menu ini.
                </Text>
              ) : (
                sortedVariants.map((variant) => (
                  <View
                    key={variant.id}
                    style={[
                      styles.variantRow,
                      { borderColor: colors.border, backgroundColor: colors.card },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "600" }}>
                        {variant.variant.name}
                      </Text>

                      {!variant.available && (
                        <Text style={{ color: colors.danger, fontSize: 11, marginTop: 2 }}>
                          Sedang tidak tersedia
                        </Text>
                      )}
                    </View>

                    <Text
                      style={{
                        color: variant.available ? colors.text : colors.subtext,
                        fontWeight: "700",
                        textDecorationLine: variant.available ? "none" : "line-through",
                      }}
                    >
                      {formatCurrency(variant.price)}
                    </Text>
                  </View>
                ))
              )}

              <View style={{ height: 24 }} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handleWrapper: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  image: { width: "100%", height: 240 },
  imagePlaceholder: { justifyContent: "center", alignItems: "center" },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    position: "absolute",
    top: 210,
    left: 16,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  body: { padding: 20, paddingTop: 24 },
  category: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  name: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  divider: { height: 1, marginVertical: 20 },
  sectionLabel: { fontSize: 15, fontWeight: "700" },
  variantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
});