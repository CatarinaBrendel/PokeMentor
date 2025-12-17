export type AppSettingKey = "showdown_username";

export type SettingsSnapshot = {
  showdown_username: string | null;
};

export type UpdateSettingsArgs = Partial<{
  showdown_username?: string | null;
}>;