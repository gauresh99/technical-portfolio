import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { purple } from './ui';

const options = ['1 week before', '1 month before', '3 months before', '6 months before', 'Custom'] as const;
const dayMs = 24 * 60 * 60 * 1000;

export const formatReminderDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-GB');
};

export const nextReminderDate = (reminders: string[] = []) => {
  if (!reminders.length) return '';
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const sorted = [...reminders].sort();
  return sorted.find((date) => new Date(`${date}T00:00:00`).getTime() >= todayStart) || sorted[0];
};

const toISO = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};
const reminderForOption = (option: string, expiryISO: string) => {
  const expiry = new Date(`${expiryISO}T00:00:00`);
  if (!Number.isFinite(expiry.getTime())) return '';
  if (option === '1 week before') return toISO(new Date(expiry.getTime() - 7 * dayMs));
  if (option === '1 month before') return toISO(addMonths(expiry, -1));
  if (option === '3 months before') return toISO(addMonths(expiry, -3));
  if (option === '6 months before') return toISO(addMonths(expiry, -6));
  return '';
};
const monthLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const buildMonthDays = (visibleMonth: Date) => {
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const total = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: total }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))];
};

export function ExpiryReminder({
  children,
  compact = false,
  inverted = false,
  productName,
  expiryDate,
  reminders = [],
  onSave,
  startInCalendar = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  inverted?: boolean;
  productName: string;
  expiryDate: string;
  reminders?: string[];
  onSave?: (reminders: string[]) => void;
  startInCalendar?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(reminders);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const expiryValid = Number.isFinite(expiry.getTime());
  const [visibleMonth, setVisibleMonth] = useState(expiryValid ? new Date(expiry.getFullYear(), expiry.getMonth(), 1) : new Date());
  const showCustom = selected.includes('Custom');
  const toggleOption = (option: string) => {
    if (option === 'Custom') {
      setSelected((current) => current.includes('Custom') ? current.filter((item) => item !== 'Custom') : [...current, 'Custom']);
      return;
    }
    const date = reminderForOption(option, expiryDate);
    if (!date) return;
    setSelected((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current.filter((item) => item !== 'Custom'), date]);
  };
  const toggleDate = (date: Date) => {
    const iso = toISO(date);
    setSelected((current) => current.includes(iso) ? current.filter((item) => item !== iso) : [...current.filter((item) => item !== 'Custom'), iso]);
  };
  const close = () => setOpen(false);
  const savedDates = useMemo(() => selected.filter((item) => item !== 'Custom').sort(), [selected]);
  const selectedSet = useMemo(() => new Set(savedDates), [savedDates]);
  const monthDays = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);
  const saveLabel = savedDates.length > 1 ? `Save ${savedDates.length} reminders` : savedDates[0] ? `Save ${formatReminderDate(savedDates[0])}` : 'Save reminder';
  const save = () => {
    onSave?.(savedDates);
    close();
  };
  const openPicker = () => {
    setSelected(startInCalendar ? [...reminders, 'Custom'] : reminders);
    setOpen(true);
  };
  const startLimit = new Date();
  startLimit.setHours(0, 0, 0, 0);
  const canPrev = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getTime() > new Date(startLimit.getFullYear(), startLimit.getMonth(), 1).getTime();
  const canNext = expiryValid && new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1).getTime() <= new Date(expiry.getFullYear(), expiry.getMonth(), 1).getTime();

  return (
    <View style={s.wrap}>
      <Pressable onPress={openPicker}>
        {children}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={s.backdrop}>
          <Pressable style={s.backdropDismiss} onPress={close} />
          <View style={[s.menu, compact && s.menuCompact, inverted && s.menuInverted]}>
            <Pressable accessibilityLabel="Close reminder picker" onPress={close} style={s.close}>
              <Ionicons name="close" size={19} color="#322E3C" />
            </Pressable>
            <Text style={s.title}>Notify me</Text>
            <Text numberOfLines={1} style={s.product}>{productName}</Text>
            {options.map((option) => {
              const optionDate = option === 'Custom' ? '' : reminderForOption(option, expiryDate);
              const active = option === 'Custom' ? showCustom : selected.includes(optionDate);
              return (
                <Pressable key={option} onPress={() => toggleOption(option)} style={[s.option, active && s.optionActive]}>
                  <Text style={[s.optionText, active && s.optionTextActive]}>{option}</Text>
                  <View style={[s.checkBox, active && s.checkBoxActive]}>
                    {active ? <Ionicons name="checkmark" size={15} color="white" /> : null}
                  </View>
                </Pressable>
              );
            })}
            {showCustom ? (
              <View style={s.calendarWrap}>
                <View style={s.calendarHeader}>
                  <Pressable disabled={!canPrev} onPress={() => setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} style={[s.monthButton, !canPrev && s.monthButtonDisabled]}>
                    <Ionicons name="chevron-back" size={17} color={purple} />
                  </Pressable>
                  <Text style={s.monthText}>{monthLabel(visibleMonth)}</Text>
                  <Pressable disabled={!canNext} onPress={() => setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} style={[s.monthButton, !canNext && s.monthButtonDisabled]}>
                    <Ionicons name="chevron-forward" size={17} color={purple} />
                  </Pressable>
                </View>
                <View style={s.weekRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={s.weekDay}>{day}</Text>)}
                </View>
                <View style={s.dayGrid}>
                  {monthDays.map((day, index) => {
                    if (!day) return <View key={`blank-${index}`} style={s.dayCell} />;
                    const iso = toISO(day);
                    const disabled = day.getTime() < startLimit.getTime() || (expiryValid && day.getTime() > expiry.getTime());
                    const active = selectedSet.has(iso);
                    return (
                      <Pressable key={iso} disabled={disabled} onPress={() => toggleDate(day)} style={[s.dayCell, active && s.dayActive, disabled && s.dayDisabled]}>
                        <Text style={[s.dayText, active && s.dayTextActive, disabled && s.dayTextDisabled]}>{day.getDate()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={s.customHint}>Pick any reminder date up to expiry.</Text>
              </View>
            ) : null}
            {savedDates.length ? (
              <Pressable onPress={save} style={s.save}>
                <Text style={s.saveText}>{saveLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 20 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 112,
    paddingHorizontal: 22,
  },
  backdropDismiss: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 },
  menu: {
    width: '100%',
    maxWidth: 290,
    padding: 14,
    paddingTop: 16,
    borderRadius: 18,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E9E4FB',
    shadowColor: '#000',
    shadowOpacity: .12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 2,
  },
  menuCompact: { maxWidth: 274 },
  menuInverted: { backgroundColor: '#FCFBFF' },
  close: { position: 'absolute', right: 10, top: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F1FF', zIndex: 3 },
  title: { fontSize: 17, lineHeight: 21, fontWeight: '900', color: '#25222F', paddingRight: 38 },
  product: { marginTop: 2, marginBottom: 8, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#8A8498' },
  option: { minHeight: 36, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionActive: { backgroundColor: '#F2EFFF' },
  optionText: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: '#34303E' },
  optionTextActive: { color: purple },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#DCD5F4', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' },
  checkBoxActive: { borderColor: purple, backgroundColor: purple },
  calendarWrap: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E7E1FA', padding: 9, backgroundColor: '#FCFBFF' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EFFF' },
  monthButtonDisabled: { opacity: .28 },
  monthText: { color: '#292633', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  weekRow: { flexDirection: 'row', marginTop: 8 },
  weekDay: { width: '14.285%', textAlign: 'center', color: '#928BA3', fontSize: 10, lineHeight: 14, fontWeight: '900' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  dayCell: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayActive: { backgroundColor: purple },
  dayDisabled: { opacity: .28 },
  dayText: { color: '#342F40', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  dayTextActive: { color: 'white' },
  dayTextDisabled: { color: '#9B94A8' },
  customHint: { marginTop: 5, fontSize: 11, lineHeight: 14, color: '#8A8498', fontWeight: '700' },
  save: { minHeight: 38, borderRadius: 12, backgroundColor: purple, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 10 },
  saveText: { color: 'white', fontSize: 13, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
});
