export const BRANDING = {
  name: "Nava Local AI Academy",
  fullName: "Nava Local AI Academy",
  tagline: "Control the Model, Own the Data",
  mission: "In this sprint, we aren't just learning *about* AI—we are learning to control it.",
  slug: "local-harness",
  welcomeTitle: "Mission Briefing: AI Training",
  colors: {
    primary: "#005041",   // Nava Green
    secondary: "#3d234d", // Nava Plum
    accent: "#fdcc52",    // Nava Gold
    surface: "#f5f2e9"    // Nava Sand
  }
};

/**
 * Utility to replace placeholders in content strings.
 * Use {{COMPANY}} in your markdown files.
 */
export function injectBranding(text: string): string {
  return text
    .replace(/{{COMPANY}}/g, BRANDING.name)
    .replace(/{{FULL_COMPANY}}/g, BRANDING.fullName)
    .replace(/{{TAGLINE}}/g, BRANDING.tagline);
}
