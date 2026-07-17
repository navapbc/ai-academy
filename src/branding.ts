export const BRANDING = {
  name: "Nava AI Academy",
  fullName: "Nava AI Academy",
  tagline: "Control the Model, Own the Data",
  mission: "In this sprint, we aren't just learning *about* AI—we are learning to control it.",
  slug: "local-harness",
  welcomeTitle: "Mission Briefing: AI Training",
  colors: {
    primary: "#107859",   // Nava Sage (green) — Figma Sage/700
    secondary: "#5b0462", // Nava Plum — Figma Plum/900
    accent: "#f8b712",    // Nava Gold — Figma Gold/700
    surface: "#f9fafb"    // Nava grey surface — Figma Gray/050 (was the tan Sand)
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
