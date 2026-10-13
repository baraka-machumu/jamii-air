// The bottom sheet in screen tests (src/components/Sheet.tsx): what it offers, and pressing a row.
import { fireEvent, screen, within } from '@testing-library/react-native';

/** The labels of the open action menu's rows, in order. */
export const sheetOptions = (): string[] =>
  within(screen.getByTestId('sheet')).getAllByRole('button').map((b) => b.props.accessibilityLabel as string);

export const pressSheet = (name: string): void =>
  fireEvent.press(within(screen.getByTestId('sheet')).getByRole('button', { name }));
