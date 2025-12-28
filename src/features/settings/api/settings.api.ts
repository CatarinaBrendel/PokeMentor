export const SettingsApi = {
  get: () => window.api.settings.get(),
  update: (args: { showdown_username?: string; openrouter_api_key?: string; openrouter_model?: string; ai_enabled?: boolean }) =>
    window.api.settings.update(args),
};
