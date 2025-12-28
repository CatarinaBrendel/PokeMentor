export type AppSettingKey = "showdown_username" | "grok_api_key" | "grok_model";

export type SettingsSnapshot = {
  showdown_username: string | null;
  grok_api_key: string | null;
  grok_model: string | null;
};

export type UpdateSettingsArgs = Partial<{
  showdown_username?: string | null;
  grok_api_key?: string | null;
  grok_model?: string | null;
}>;
