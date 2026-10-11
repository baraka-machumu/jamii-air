import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

/** Signed-out screens (App Flow §4): Welcome, Log in, Sign up, Forgot password (task 3.4). */
export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
