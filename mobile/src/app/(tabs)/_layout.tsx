import Tabs from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';

/** The five tabs (App Flow §2): Home · Search · Create · Activity · Profile. */
export default function TabsLayout() {
  // The unread badge comes from GET /notifications/unread-count with task 3.10.
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
