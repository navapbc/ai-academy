import { describe, test, expect } from 'vitest';
import {
  buildCohortManagement,
  type CohortRow,
  type ProfileRow,
  type EnrollmentRow,
  type ChampionRow,
} from './adminCohorts';

const cohorts: CohortRow[] = [
  { id: 'c-b', name: 'Beta' },
  { id: 'c-a', name: 'Alpha' },
];
const profiles: ProfileRow[] = [
  { id: 'u1', full_name: 'Ada Lovelace', email: 'ada@navapbc.com', role: 'learner' },
  { id: 'u2', full_name: null, email: 'champ@navapbc.com', role: 'champion' },
  { id: 'u3', full_name: '  ', email: null, role: 'learner' },
];
const enrollments: EnrollmentRow[] = [
  { user_id: 'u1', cohort_id: 'c-a' },
  { user_id: 'u3', cohort_id: 'c-b' },
];
const champions: ChampionRow[] = [{ user_id: 'u2', cohort_id: 'c-a' }];

describe('buildCohortManagement', () => {
  test('groups members + champions per cohort and sorts cohorts by name', () => {
    const r = buildCohortManagement(cohorts, profiles, enrollments, champions);
    expect(r.cohorts.map((c) => c.name)).toEqual(['Alpha', 'Beta']); // sorted
    const alpha = r.cohorts.find((c) => c.id === 'c-a')!;
    expect(alpha.members.map((m) => m.id)).toEqual(['u1']);
    expect(alpha.champions.map((m) => m.id)).toEqual(['u2']);
    const beta = r.cohorts.find((c) => c.id === 'c-b')!;
    expect(beta.members.map((m) => m.id)).toEqual(['u3']);
    expect(beta.champions).toEqual([]);
  });

  test('resolves display names (full_name → email → short id) and lists all users', () => {
    const r = buildCohortManagement(cohorts, profiles, enrollments, champions);
    const byId = new Map(r.users.map((u) => [u.id, u]));
    expect(byId.get('u1')!.name).toBe('Ada Lovelace');
    expect(byId.get('u2')!.name).toBe('champ@navapbc.com'); // full_name null → email
    expect(byId.get('u3')!.name).toBe('User u3'); // blank name + null email → short id
    expect(r.users).toHaveLength(3);
  });

  test('skips enrollment/champion rows for users the admin cannot resolve', () => {
    const r = buildCohortManagement(
      cohorts,
      profiles,
      [...enrollments, { user_id: 'ghost', cohort_id: 'c-a' }],
      champions,
    );
    const alpha = r.cohorts.find((c) => c.id === 'c-a')!;
    expect(alpha.members.map((m) => m.id)).toEqual(['u1']); // ghost dropped
  });
});
