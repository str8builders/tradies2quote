export const BUSINESS_NAME_REQUIRED = {
  error: "business_name_required",
  message: "Add your business name in Settings before sending or downloading a quote.",
  settings_url: "/app/settings",
} as const;

export function businessNameForDocuments(name: string | null | undefined): string | null {
  return name?.trim() || null;
}
