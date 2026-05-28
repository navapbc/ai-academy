# Curriculum and Content Guide

This platform is designed to be easily extensible with new phases and modules.

## How to add a Research Module

1.  **Create Markdown:** Add a new `.md` file to `src/content/` (e.g., `p5-m1.md`).
2.  **Import in Constants:** Update `src/constants.ts`:
    ```typescript
    import contentP5M1 from './content/p5-m1.md?raw';
    ```
3.  **Define Phase/Module:** Add the module data to the `PHASES` array in `constants.ts`.

## Content Types

-   `content`: Standard markdown with an optional local AI playground sidebar.
-   `lab`: Specialized interactive environments (like the Grounding/Prompt Lab).
-   `quiz`: Multiple-choice assessments using `QUIZ_DATA`.
-   `simulator`: Interactive privacy/security simulations.

## Best Practices for Writing AI Training

-   **Use Branding Placeholders:** Always use `{{COMPANY}}` instead of hardcoded names.
-   **Local AI Integration:** In every lesson, try to reference the "Local Tutor" playground. Encourage users to verify facts with their local engine.
-   **Markdown Standards:** Use clear headings (`##`) and callouts. The platform uses `react-markdown` with Tailwind Typography (`prose`).

## Adding Resources

Each module has a `resources` array. Link to blog posts, videos (YouTube/Vimeo), or internal PDFs here.
