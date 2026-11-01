import { useQueryClient } from '@tanstack/react-query';
import Tabs from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { unreadKey, useUnreadCount } from '@/api/notifications';
import { TabBar } from '@/components/TabBar';

/**
 * The Kidili tabs (App Flow §16.1): Home · Udaku · Chat · Profile, with the + between Udaku and
 * Chat drawn by the TabBar. Search and Activity open from Home's header. The unread count behind
 * the bell (App Flow §9) is read when the tabs open, whenever the app comes to the foreground, on a
 * push (src/notifications/push.ts) and after Activity marks everything read.
 */
export default function TabsLayout() {
  const queryClient = useQueryClient();
  useUnreadCount(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: unreadKey });
    });
    return () => sub.remove();
  }, [queryClient]);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="udaku" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
