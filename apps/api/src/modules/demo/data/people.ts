import type { MemberRole } from '@clientry/shared/auth';

export type PersonKey = 'ann' | 'max' | 'sofia' | 'liam' | 'nina';

export interface DemoPerson {
  readonly id: string;
  readonly name: string;
  // The .example top-level domain is reserved and never receives mail.
  readonly email: string;
  readonly role: MemberRole;
  // Counted from the reset that creates the membership; later resets keep the date.
  readonly joinedDaysAgo: number;
}

// Fixed ids: sessions, the access guard's membership read and member filters in visitors' URLs
// stay valid across resets.
export const DEMO_WORKSPACE = {
  id: '0199d0a0-0000-7000-8000-000000000100',
  name: 'Pixel Studio',
} as const;

export const PEOPLE: Readonly<Record<PersonKey, DemoPerson>> = {
  ann: {
    id: '0199d0a0-0000-7000-8000-000000000001',
    name: 'Ann Carter',
    email: 'ann@pixel-studio.example',
    role: 'owner',
    joinedDaysAgo: 420,
  },
  max: {
    id: '0199d0a0-0000-7000-8000-000000000002',
    name: 'Max Novak',
    email: 'max@pixel-studio.example',
    role: 'manager',
    joinedDaysAgo: 390,
  },
  sofia: {
    id: '0199d0a0-0000-7000-8000-000000000003',
    name: 'Sofia Reyes',
    email: 'sofia@pixel-studio.example',
    role: 'manager',
    joinedDaysAgo: 330,
  },
  liam: {
    id: '0199d0a0-0000-7000-8000-000000000004',
    name: 'Liam Brooks',
    email: 'liam@pixel-studio.example',
    role: 'manager',
    joinedDaysAgo: 290,
  },
  nina: {
    id: '0199d0a0-0000-7000-8000-000000000005',
    name: 'Nina Petrova',
    email: 'nina@pixel-studio.example',
    role: 'manager',
    joinedDaysAgo: 240,
  },
};

// 'ann' alone, or 'ann>max': created by Ann for Max.
export type People = PersonKey | `${PersonKey}>${PersonKey}`;
