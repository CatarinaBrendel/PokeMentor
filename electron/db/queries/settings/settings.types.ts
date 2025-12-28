export type AppSettingKey =
  | "showdown_username"
  | "openrouter_api_key"
  | "openrouter_model"
  | "ai_enabled";

export type SettingsSnapshot = {
  showdown_username: string | null;
  openrouter_api_key: string | null;
  openrouter_model: string | null;
  ai_enabled: boolean;
};

export type UpdateSettingsArgs = Partial<{
  showdown_username?: string | null;
  openrouter_api_key?: string | null;
  openrouter_model?: string | null;
  ai_enabled?: boolean | null;
}>;
