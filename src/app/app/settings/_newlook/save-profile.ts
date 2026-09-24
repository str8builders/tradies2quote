import { saveSettings } from "../actions";
import { SAVE_SETTINGS_INITIAL } from "../_state";
import { outcomeFromSettingsState, settingsFormData, type SaveOutcome, type SettingsValues } from "./model";

/**
 * Save the profile through the existing `saveSettings` action with the full
 * field set the old form posts (see model.ts), and read its answer.
 */
export async function saveProfile(values: SettingsValues): Promise<SaveOutcome> {
  const state = await saveSettings(SAVE_SETTINGS_INITIAL, settingsFormData(values));
  return outcomeFromSettingsState(state);
}
