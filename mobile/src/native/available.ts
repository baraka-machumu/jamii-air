// Whether a native module is in this build, asked without loading its JavaScript package.
//
// Packages such as expo-notifications and expo-clipboard throw while loading when their native
// side is missing (a dev build made before they were added) or not allowed (expo-notifications
// in Expo Go on Android, since SDK 53). A try/catch around require() does not help in
// development: Metro's loader reports an error thrown while a module loads as a fatal "Uncaught
// Error" itself and never rethrows it. So check first, and only require() when the answer is yes.
import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Running inside the Expo Go app rather than a Jamii Air build. */
export function inExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function nativeModuleAvailable(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}
