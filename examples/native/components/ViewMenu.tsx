import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type ViewMenuProps<V extends string> = {
  value: V;
  options: readonly V[];
  onChange: (value: V) => void;
};

// The demo's view picker, matching the "View" select in the web examples. React
// Native has no select element, so the options open in a modal menu.
export function ViewMenu<V extends string>({ value, options, onChange }: ViewMenuProps<V>) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>View</Text>
      <Pressable
        role="button"
        aria-label="View"
        aria-expanded={open}
        accessibilityValue={{ text: value }}
        style={styles.trigger}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.triggerText}>{value}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          aria-label="Close view menu"
          onPress={() => setOpen(false)}
        >
          <View role="menu" aria-label="View" style={styles.menu}>
            <ScrollView>
              {options.map((option) => {
                const selected = option === value;
                return (
                  <Pressable
                    key={option}
                    role="menuitem"
                    aria-checked={selected}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    onPress={() => {
                      setOpen(false);
                      onChange(option);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionSelected]}>
                      {option}
                    </Text>
                    {selected ? <Text style={styles.optionSelected}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  label: { fontSize: 14, color: "#1A1B1E" },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#dedfe3",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  triggerText: { fontSize: 14, color: "#1A1B1E" },
  chevron: { fontSize: 14, color: "#6B7280" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  menu: {
    width: "100%",
    maxWidth: 320,
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionPressed: { backgroundColor: "#eef0f3" },
  optionText: { fontSize: 16, color: "#1A1B1E" },
  optionSelected: { fontSize: 16, color: "#1F6FEB", fontWeight: "600" },
});
