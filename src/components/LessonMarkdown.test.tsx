// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LessonMarkdown from './LessonMarkdown';
import { BRANDING } from '../branding';

// The shared learner/CMS-preview renderer (P5.4-3). Reused by ModuleRenderer (live
// lesson) and LessonEditor (preview) so preview ≡ published.
describe('LessonMarkdown', () => {
  test('renders GFM markdown to HTML', () => {
    render(<LessonMarkdown content={'## Title\n\n- one\n- two'} />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('injects branding placeholders before rendering', () => {
    render(<LessonMarkdown content={'Welcome to {{COMPANY}}.'} />);
    expect(screen.getByText(new RegExp(BRANDING.name))).toBeInTheDocument();
  });
});
