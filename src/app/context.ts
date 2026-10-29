import type { CoverLayout } from '../core';
import type { AppState, ScreenId } from './state';

export interface Ctx {
  state: AppState;
  /** Persist settings. */
  save(): void;
  /** The latest layout for the book panel, or `null` while its fields are incomplete. */
  layout(): CoverLayout | null;
  /** Ask the shell to re-render whichever screen is showing. */
  refresh(): void;
  /** Change the display unit; the custom-size inputs are converted so no value is lost. */
  setUnit(unit: AppState['unit']): void;
}

export interface Screen {
  id: ScreenId;
  /** Re-render from the current state and book. Called when visible and something changed. */
  refresh(): void;
  /** Called every time the screen is shown (after any pending refresh). */
  activate?(): void;
  /** Called when the screen is hidden. */
  deactivate?(): void;
}
