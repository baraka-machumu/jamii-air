import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { useAndroidKeyboardHeight } from './keyboard';

type Listener = (e: { endCoordinates: { height: number } }) => void;

describe('useAndroidKeyboardHeight', () => {
  const os = Platform.OS;
  let listeners: Record<string, Listener>;

  beforeEach(() => {
    listeners = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: Listener) => {
      listeners[event] = listener;
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => { Platform.OS = os; jest.restoreAllMocks(); });

  it('follows the keyboard on Android', () => {
    Platform.OS = 'android';
    const { result } = renderHook(() => useAndroidKeyboardHeight());
    expect(result.current).toBe(0);
    act(() => listeners.keyboardDidShow!({ endCoordinates: { height: 280 } }));
    expect(result.current).toBe(280);
    act(() => listeners.keyboardDidHide!({ endCoordinates: { height: 0 } }));
    expect(result.current).toBe(0);
  });

  it('stays 0 on iOS (KeyboardAvoidingView handles it)', () => {
    Platform.OS = 'ios';
    const { result } = renderHook(() => useAndroidKeyboardHeight());
    expect(Keyboard.addListener).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });
});
