import { useQueryClient } from '@tanstack/react-query';
import Tabs from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { unreadKey, useUnreadCount } from '@/api/notifications';
import { TabBar } from '@/components/TabBar';

/**
 * The five tabs (App Flow §2): Home · Search · Create · Activity · Profile. Activity carries the
 * unread badge (App Flow §9): read when the tabs open, whenever the app comes to the foreground,
 * on a push (src/notifications/push.ts) and after Activity marks everything read.
 */
export default function TabsLayout() {
  const queryClient = useQueryClient();
  const unread = useUnreadCount(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: unreadKey });
    });
    return () => sub.remove();
  }, [queryClient]);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} badge={unread.data} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
