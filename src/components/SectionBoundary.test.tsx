// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SectionBoundary from './SectionBoundary';

// Scoped boundary (audit D-16): contains a child render throw to a compact,
// named fallback card instead of letting it bubble to the app-level
// ErrorBoundary's whole-screen reload UI.

function Bomb(): never {
  throw new Error('malformed config');
}

beforeEach(() => {
  // React logs caught boundary errors; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SectionBoundary', () => {
  test('renders its children when nothing throws', () => {
    render(
      <SectionBoundary label="quiz">
        <p>healthy content</p>
      </SectionBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a throwing child renders the scoped, labelled fallback — not the app reload screen', () => {
    render(
      <SectionBoundary label="interactive exercise">
        <Bomb />
      </SectionBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/This interactive exercise couldn['’]t load/);
    expect(alert).toHaveTextContent(/rest of the lesson still works/);
    // The app-level ErrorBoundary's reload affordance must NOT be this fallback.
    expect(screen.queryByRole('button', { name: /Reload/i })).not.toBeInTheDocument();
    // The error was logged for debugging.
    expect(console.error).toHaveBeenCalled();
  });

  test('siblings outside the boundary survive a contained crash', () => {
    render(
      <div>
        <p>lesson body</p>
        <SectionBoundary label="quiz">
          <Bomb />
        </SectionBoundary>
        <p>resources</p>
      </div>,
    );
    expect(screen.getByText('lesson body')).toBeInTheDocument();
    expect(screen.getByText('resources')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/This quiz couldn['’]t load/);
  });
});
