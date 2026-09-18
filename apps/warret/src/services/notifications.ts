import { Platform } from 'react-native';
import type { Product } from '../data/products';

// expo-notifications has no scheduled-notification support on web.
const isNative = Platform.OS !== 'web';

export type ReminderScheduleOptions = {
  enabled?: boolean;
  channel?: 'Push notification' | 'Email' | 'Both';
  quietStart?: string;
  quietEnd?: string;
};

if (isNative) {
  // Dynamic import so the module is never evaluated on web (it crashes).
  import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  });
}

async function getNotifications() {
  return import('expo-notifications');
}

function parseClock(value?: string): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  const hour12 = Number(match[1]);
  const minutes = Number(match[2] || '0');
  if (hour12 < 1 || hour12 > 12 || minutes < 0 || minutes > 59) return null;
  const period = match[3].toUpperCase();
  const hour = period === 'AM' ? (hour12 === 12 ? 0 : hour12) : (hour12 === 12 ? 12 : hour12 + 12);
  return hour * 60 + minutes;
}

function inQuietWindow(minutes: number, start: number, end: number) {
  if (start === end) return false;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

function triggerDate(reminderISO: string, options?: ReminderScheduleOptions): Date {
  const start = parseClock(options?.quietStart);
  const end = parseClock(options?.quietEnd);
  const defaultMinutes = 9 * 60;
  const minutes = start !== null && end !== null && inQuietWindow(defaultMinutes, start, end)
    ? end
    : defaultMinutes;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(`${reminderISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
}

export const NotificationService = {
  async requestPermissions(): Promise<boolean> {
    if (!isNative) return false;
    const Notifications = await getNotifications();
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  async scheduleReminder(
    productId: string,
    productName: string,
    reminderISO: string,
    options?: ReminderScheduleOptions,
  ): Promise<string | null> {
    if (options?.enabled === false) return null;
    if (options?.channel === 'Email') return null;
    if (!isNative) return null;
    const date = triggerDate(reminderISO, options);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;
    try {
      const Notifications = await getNotifications();
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Warranty reminder',
          body: `${productName} is expiring soon — tap to review.`,
          data: { productId, reminderISO },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
    } catch {
      return null;
    }
  },

  async sendTestNotification(options?: ReminderScheduleOptions): Promise<string | null> {
    if (options?.enabled === false) return null;
    if (options?.channel === 'Email') return null;
    if (!isNative) return null;
    try {
      const Notifications = await getNotifications();
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Warret test notification',
          body: "Notifications are working — you'll get reminders before warranties expire.",
          data: { test: true },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
        },
      });
    } catch {
      return null;
    }
  },

  async cancelAllForProduct(productId: string): Promise<void> {
    if (!isNative) return;
    const Notifications = await getNotifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content.data?.productId === productId)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  },

  async syncAll(products: Product[], options?: ReminderScheduleOptions): Promise<void> {
    if (!isNative) return;
    const Notifications = await getNotifications();
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const product of products) {
      for (const reminderDate of product.reminders ?? []) {
        await NotificationService.scheduleReminder(product.id, product.name, reminderDate, options);
      }
    }
  },
};
