export const SettingsApi = {
  get: () => window.api.settings.get(),
  update: (args: { showdown_username?: string }) => window.api.settings.update(args),
};