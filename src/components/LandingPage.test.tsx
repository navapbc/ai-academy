// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingPage from './LandingPage';
import { BRANDING } from '../branding';

describe('LandingPage', () => {
  test('renders the hero, the three structure cards, and the Enter button', () => {
    render(<LandingPage onEnter={() => {}} />);
    expect(
      screen.getByRole('heading', { level: 1, name: new RegExp(BRANDING.name) }),
    ).toBeTruthy();
    expect(screen.getByText('Course weeks')).toBeTruthy();
    expect(screen.getByText('Supplemental coursework')).toBeTruthy();
    expect(screen.getByText('Resources & additional lessons')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enter AI Academy/i })).toBeTruthy();
  });

  test('clicking "Enter AI Academy" calls onEnter once', () => {
    const onEnter = vi.fn();
    render(<LandingPage onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Enter AI Academy/i }));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
