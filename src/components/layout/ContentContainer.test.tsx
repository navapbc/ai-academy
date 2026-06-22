// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContentContainer from './ContentContainer';

describe('ContentContainer (Nava layout grid)', () => {
  test('default: renders children in the prose-width container with responsive margins', () => {
    render(
      <ContentContainer>
        <p>hello</p>
      </ContentContainer>,
    );
    const el = screen.getByText('hello').parentElement!;
    expect(el.className).toContain('max-w-5xl');
    expect(el.className).toContain('mx-auto');
    expect(el.className).toMatch(/p-8.*lg:p-12.*xl:p-16/);
  });

  test('wide: uses the wider 1440-grid content width for data-dense views', () => {
    render(
      <ContentContainer wide>
        <p>dash</p>
      </ContentContainer>,
    );
    const el = screen.getByText('dash').parentElement!;
    expect(el.className).toContain('max-w-7xl');
    expect(el.className).not.toContain('max-w-5xl');
  });

  test('inactive: keeps children mounted but hidden (state survives tab switches)', () => {
    render(
      <ContentContainer active={false}>
        <p>kept</p>
      </ContentContainer>,
    );
    // Still in the DOM (mounted)…
    const el = screen.getByText('kept').parentElement!;
    // …but hidden, with no layout container applied.
    expect(el.className).toBe('hidden');
  });
});
