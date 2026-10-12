// The app's routes for renderRouter (expo-router/testing-library), shared by the screen tests.
import AuthLayout from '@/app/(auth)/_layout';
import ForgotPassword from '@/app/(auth)/forgot-password';
import Welcome from '@/app/(auth)/index';
import LogIn from '@/app/(auth)/login';
import SignUp from '@/app/(auth)/signup';
import TabsLayout from '@/app/(tabs)/_layout';
import Activity from '@/app/(tabs)/activity';
import Create from '@/app/(tabs)/create';
import Home from '@/app/(tabs)/index';
import Profile from '@/app/(tabs)/profile';
import Search from '@/app/(tabs)/search';
import RootLayout from '@/app/_layout';

export const routes = {
  _layout: RootLayout,
  '(auth)/_layout': AuthLayout,
  '(auth)/index': Welcome,
  '(auth)/login': LogIn,
  '(auth)/signup': SignUp,
  '(auth)/forgot-password': ForgotPassword,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': Home,
  '(tabs)/search': Search,
  '(tabs)/create': Create,
  '(tabs)/activity': Activity,
  '(tabs)/profile': Profile,
};
