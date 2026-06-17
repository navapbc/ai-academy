// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CohortDashboard from './CohortDashboard';
import type { CohortSummary, ScoreDistribution } from '../../lib/dashboard';
import type { LearnerRosterEntry } from '../../lib/learnerDetail';

const { fetchCohortSummaries, fetchScoreDistribution, fetchCohortLearners } = vi.hoisted(() => ({
  fetchCohortSummaries: vi.fn(),
  fetchScoreDistribution: vi.fn(),
  fetchCohortLearners: vi.fn(),
}));

vi.mock('../../lib/dashboard', () => ({
  fetchCohortSummaries,
  fetchScoreDistribution,
}));
vi.mock('../../lib/learnerDetail', () => ({ fetchCohortLearners }));
// useDashboard subscribes to realtime on mount; stub it to a no-op so the test
// never opens a websocket (`.env` makes the real client configured under vitest).
vi.mock('../../lib/dashboardRealtime', () => ({
  subscribeToDashboardChanges: () => () => {},
}));

const LEARNER_A: LearnerRosterEntry = {
  userId: 'u-1',
  cohortId: 'c-a',
  name: 'Ada Lovelace',
  email: 'ada@navapbc.com',
  completionPct: 0.5,
  avgQuizPct: 0.7,
  glatPassed: false,
  reviewableLabs: 1,
};
const noop = () => {};

const ALPHA: CohortSummary = {
  cohortId: 'c-a',
  cohortName: 'Alpha cohort',
  learnerCount: 3,
  avgCompletionPct: 0.5,
  glatPassRate: 0,
  avgQuizPct: null,
  reviewableTotal: 2,
};
const BETA: CohortSummary = {
  cohortId: 'c-b',
  cohortName: 'Beta cohort',
  learnerCount: 4,
  avgCompletionPct: 0.75,
  glatPassRate: 0.25,
  avgQuizPct: 0.82,
  reviewableTotal: 0,
};
const DIST = new Map<string, ScoreDistribution>([
  ['c-a', { lt60: 1, '60to79': 1, '80to100': 1 }],
  ['c-b', { lt60: 0, '60to79': 0, '80to100': 0 }],
]);

beforeEach(() => {
  fetchCohortSummaries.mockReset();
  fetchScoreDistribution.mockReset();
  fetchCohortLearners.mockReset();
  fetchCohortLearners.mockResolvedValue([]);
});

describe('CohortDashboard', () => {
  test('renders one block per cohort under "All cohorts"', async () => {
    fetchCohortSummaries.mockResolvedValue([ALPHA, BETA]);
    fetchScoreDistribution.mockResolvedValue(DIST);

    render(<CohortDashboard onSelectLearner={noop} />);

    expect(await screen.findByText('Alpha cohort')).toBeInTheDocument();
    expect(screen.getByText('Beta cohort')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  test('the filter narrows the display to a single cohort', async () => {
    fetchCohortSummaries.mockResolvedValue([ALPHA, BETA]);
    fetchScoreDistribution.mockResolvedValue(DIST);
    render(<CohortDashboard onSelectLearner={noop} />);
    await screen.findByText('Alpha cohort');

    await userEvent.selectOptions(screen.getByLabelText(/cohort/i), 'c-b');

    expect(screen.getByRole('combobox')).toHaveValue('c-b');
    expect(screen.getByText('Beta cohort')).toBeInTheDocument();
    expect(screen.queryByText('Alpha cohort')).not.toBeInTheDocument();
  });

  test('shows "no quiz data yet" for a cohort with an empty distribution', async () => {
    fetchCohortSummaries.mockResolvedValue([BETA]);
    fetchScoreDistribution.mockResolvedValue(DIST);
    render(<CohortDashboard onSelectLearner={noop} />);

    expect(await screen.findByText(/no quiz data yet/i)).toBeInTheDocument();
  });

  test('renders the empty state when no cohorts are visible', async () => {
    fetchCohortSummaries.mockResolvedValue([]);
    fetchScoreDistribution.mockResolvedValue(new Map());
    render(<CohortDashboard onSelectLearner={noop} />);

    expect(await screen.findByText(/no cohorts assigned to you yet/i)).toBeInTheDocument();
  });

  test('renders an error + retry that re-fetches', async () => {
    fetchCohortSummaries.mockRejectedValueOnce(new Error('boom'));
    fetchScoreDistribution.mockRejectedValueOnce(new Error('boom'));
    render(<CohortDashboard onSelectLearner={noop} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    fetchCohortSummaries.mockResolvedValue([ALPHA]);
    fetchScoreDistribution.mockResolvedValue(DIST);
    await userEvent.click(within(alert).getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Alpha cohort')).toBeInTheDocument();
  });

  test('clicking a learner in the roster fires onSelectLearner with that learner', async () => {
    fetchCohortSummaries.mockResolvedValue([ALPHA]);
    fetchScoreDistribution.mockResolvedValue(DIST);
    fetchCohortLearners.mockResolvedValue([LEARNER_A]);
    const onSelectLearner = vi.fn();
    render(<CohortDashboard onSelectLearner={onSelectLearner} />);

    await userEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));

    expect(onSelectLearner).toHaveBeenCalledWith(LEARNER_A);
  });
});
