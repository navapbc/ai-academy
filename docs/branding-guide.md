# Branding and Customization Guide

The platform is built to be "white-labeled" or customized for specific organizational needs. All major branding decisions are centralized in `src/branding.ts`.

## The Branding Object

| Key | Description | Example |
| :--- | :--- | :--- |
| `name` | Short name used in text and placeholders. | `Nava` |
| `fullName` | Formal name used in legal or footer context. | `Nava Public Benefit Corp` |
| `tagline` | Mission statement or sub-branding. | `Trust through technology` |
| `colors` | Tailwind-compatible hex codes. | `{ primary: "#5C1D40" }` |

## Color Palette Strategy

The application uses these colors throughout the UI:
- **Primary:** Sidebar backgrounds, headers, and primary buttons.
- **Secondary:** Success states, progress bars, and "Nava Green" accents.
- **Accent:** Warnings, alerts, and highlighting (Gold).
- **Surface:** Light backgrounds and subtle containers (Mint/Sky).

## Using Placeholders in Content

The platform automatically scans all markdown content for placeholders. This ensures that you can update the company name once in `branding.ts` and have it propagate through dozens of lessons.

**Supported Placeholders:**
- `{{COMPANY}}` -> `BRANDING.name`
- `{{FULL_COMPANY}}` -> `BRANDING.fullName`
- `{{TAGLINE}}` -> `BRANDING.tagline`

## Logo and Icons

Currently, the app uses **Lucide React** icons. To change the brand icon:
1. Open `src/components/layout/Sidebar.tsx`.
2. Locate the logo section.
3. Replace the `BarChart3` icon with your desired icon or an `<img>` tag referencing your logo asset.
