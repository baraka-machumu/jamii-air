// Keeping an input above the keyboard on Android. The app runs edge-to-edge (RN 0.81+), so the
// window no longer shrinks for the keyboard (adjustResize does nothing), and KeyboardAvoidingView
// leans on the visible display frame, which some phones (Samsung A16) report wrongly: the input
// ended up under the keyboard. The height RN reports is the keyboard minus the system bars, which
// is exactly the lift a screen that already keeps clear of the bottom inset needs.
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Android: the keyboard height above the navigation bar (0 when hidden). iOS: always 0. */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(Math.max(0, e.endCoordinates.height)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
