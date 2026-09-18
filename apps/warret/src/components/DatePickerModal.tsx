import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { purple } from './ui';

const toISO = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const buildMonthDays = (visibleMonth: Date) => {
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const total = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: total }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))];
};

export const formatDisplayDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

export function DatePickerModal({
  title,
  selectedDate,
  visible,
  onClose,
  onSelect,
}: {
  title: string;
  selectedDate: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const selectedValid = Number.isFinite(selected.getTime());
  const [visibleMonth, setVisibleMonth] = useState(selectedValid ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date());
  const days = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.dismiss} onPress={onClose} />
        <View style={s.menu}>
          <Pressable accessibilityLabel="Close date picker" onPress={onClose} style={s.close}>
            <Ionicons name="close" size={19} color="#322E3C" />
          </Pressable>
          <Text style={s.title}>{title}</Text>
          <Text style={s.sub}>Selected {formatDisplayDate(selectedDate)}</Text>
          <View style={s.calendarWrap}>
            <View style={s.calendarHeader}>
              <Pressable onPress={() => setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} style={s.monthButton}>
                <Ionicons name="chevron-back" size={17} color={purple} />
              </Pressable>
              <Text style={s.monthText}>{monthLabel(visibleMonth)}</Text>
              <Pressable onPress={() => setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} style={s.monthButton}>
                <Ionicons name="chevron-forward" size={17} color={purple} />
              </Pressable>
            </View>
            <View style={s.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={s.weekDay}>{day}</Text>)}
            </View>
            <View style={s.dayGrid}>
              {days.map((day, index) => {
                if (!day) return <View key={`blank-${index}`} style={s.dayCell} />;
                const iso = toISO(day);
                const active = iso === selectedDate;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => {
                      onSelect(iso);
                      onClose();
                    }}
                    style={[s.dayCell, active && s.dayActive]}
                  >
                    <Text style={[s.dayText, active && s.dayTextActive]}>{day.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 112, paddingHorizontal: 22 },
  dismiss: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  menu: { width: '100%', maxWidth: 290, padding: 14, paddingTop: 16, borderRadius: 18, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9E4FB', shadowColor: '#000', shadowOpacity: .12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, zIndex: 2 },
  close: { position: 'absolute', right: 10, top: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F1FF', zIndex: 3 },
  title: { fontSize: 17, lineHeight: 21, fontWeight: '900', color: '#25222F', paddingRight: 38 },
  sub: { marginTop: 2, marginBottom: 8, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#8A8498' },
  calendarWrap: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E7E1FA', padding: 9, backgroundColor: '#FCFBFF' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EFFF' },
  monthText: { color: '#292633', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  weekRow: { flexDirection: 'row', marginTop: 8 },
  weekDay: { width: '14.285%', textAlign: 'center', color: '#928BA3', fontSize: 10, lineHeight: 14, fontWeight: '900' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  dayCell: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayActive: { backgroundColor: purple },
  dayText: { color: '#342F40', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  dayTextActive: { color: 'white' },
});
