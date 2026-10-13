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
import Caption from '@/app/compose/caption';
import Crop from '@/app/compose/crop';
import EditProfile from '@/app/edit-profile';
import Onboarding from '@/app/onboarding/index';
import Comments from '@/app/p/[id]/comments';
import PostDetail from '@/app/p/[id]/index';
import FindPeople from '@/app/onboarding/people';
import Settings from '@/app/settings/index';
import ChangePassword from '@/app/settings/password';
import UserProfile from '@/app/u/[username]/index';
import FollowListScreen from '@/app/u/[username]/[list]';

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
  'edit-profile': EditProfile,
  'settings/index': Settings,
  'settings/password': ChangePassword,
  'onboarding/index': Onboarding,
  'onboarding/people': FindPeople,
  'u/[username]/index': UserProfile,
  'u/[username]/[list]': FollowListScreen,
  'compose/crop': Crop,
  'compose/caption': Caption,
  'p/[id]/index': PostDetail,
  'p/[id]/comments': Comments,
};
