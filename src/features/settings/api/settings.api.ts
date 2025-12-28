export const SettingsApi = {
  get: () => window.api.settings.get(),
  update: (args: { showdown_username?: string; grok_api_key?: string; grok_model?: string }) =>
    window.api.settings.update(args),
};
