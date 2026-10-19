import type { ClientSource } from '@clientry/shared/clients';

import type { PersonKey } from './people.js';

// Which contacts the client has: e an email, p a phone. Emails come from the name and the company
// at .example domains; phones from the row's index in the fictional +1 555-01xx range.
export type ContactKind = 'ep' | 'e' | 'p';

export type ClientRow = readonly [
  key: string,
  name: string,
  company: string | null,
  source: ClientSource | null,
  // Space-separated.
  tags: string,
  contact: ContactKind,
  createdBy: PersonKey,
  daysAgo: number,
];

// Oldest first; every client is fictional.
export const CLIENTS: readonly ClientRow[] = [
  ['romashka', 'Olga Romanova', 'Romashka', 'website', 'ecommerce repeat', 'ep', 'max', 198],
  ['northwind', 'Daniel Price', 'Northwind Coffee', 'referral', 'b2b repeat', 'ep', 'ann', 192],
  ['brightline', 'Priya Shah', 'Brightline Logistics', 'website', 'b2b repeat', 'ep', 'sofia', 187],
  ['green', 'Tom Becker', 'Greenleaf Grocers', 'telegram', 'ecommerce repeat', 'ep', 'liam', 181],
  ['harbor', 'Emma Lindqvist', 'Harbor Dental', 'website', '', 'ep', 'nina', 176],
  ['tinyfox', 'Lucas Moreau', 'Tiny Fox Toys', 'telegram', 'ecommerce repeat', 'ep', 'max', 170],
  ['openhands', 'Grace Okafor', 'Open Hands Charity', 'referral', 'nonprofit', 'ep', 'ann', 165],
  ['bolt', 'Ryan Cole', 'Bolt Fitness', 'website', 'startup', 'e', 'sofia', 159],
  ['lumen', 'Hana Sato', 'Lumen Architects', 'referral', 'b2b repeat', 'ep', 'ann', 152],
  ['quill', 'Oscar Hale', 'Quill & Ink', 'telegram', 'ecommerce', 'ep', 'liam', 146],
  ['maple', 'Chloe Martin', 'Maple Street Bakery', 'website', '', 'p', 'max', 141],
  ['vertex', 'Arjun Mehta', 'Vertex Analytics', 'referral', 'b2b startup', 'ep', 'nina', 135],
  ['seaside', 'Laura Ricci', 'Seaside Rentals', 'website', '', 'ep', 'sofia', 128],
  ['kite', 'Ben Turner', 'Kite Studio', 'other', 'startup', 'e', 'liam', 121],
  ['aurora', 'Sara Nilsen', 'Aurora Yoga', 'telegram', '', 'ep', 'max', 115],
  ['ironbridge', 'Mark Evans', 'Ironbridge Legal', 'referral', 'b2b', 'ep', 'ann', 109],
  ['petal', 'Julia Weber', 'Petal & Stem', 'website', 'ecommerce urgent', 'ep', 'nina', 102],
  ['cobalt', 'Victor Diaz', 'Cobalt Robotics', 'website', 'b2b startup', 'ep', 'sofia', 96],
  ['hearth', 'Anna Kowalski', 'Hearth Home Goods', 'telegram', 'ecommerce', 'ep', 'liam', 90],
  ['riverbend', 'Paul Walsh', 'Riverbend Clinic', 'referral', '', 'ep', 'ann', 84],
  ['sprout', 'Mia Fischer', 'Sprout Kids Club', 'other', 'nonprofit', 'e', 'max', 78],
  ['atlas', 'Noah Kim', 'Atlas Movers', 'website', 'b2b', 'ep', 'nina', 72],
  ['velvet', 'Isla Grant', 'Velvet Room Salon', 'telegram', '', 'p', 'sofia', 66],
  ['pinecone', 'Jacob Ross', 'Pinecone Outdoors', 'website', 'ecommerce', 'ep', 'liam', 60],
  ['nova', 'Elena Duarte', 'Nova Dental Lab', 'referral', 'b2b', 'ep', 'ann', 54],
  ['tidal', 'Sam Rivera', 'Tidal Surf School', 'telegram', 'startup', 'ep', 'max', 48],
  ['ember', 'Zoe Clarke', 'Ember Coffee Roasters', 'website', 'ecommerce', 'ep', 'nina', 43],
  ['summit', 'Leo Martins', 'Summit Accounting', 'referral', 'b2b', 'ep', 'sofia', 38],
  ['bluebird', 'Ava Thompson', 'Bluebird Books', 'website', 'ecommerce', 'ep', 'liam', 33],
  ['henry', 'Henry Adams', null, null, '', 'p', 'max', 28],
  ['cedar', 'Lily Evans', 'Cedar & Co Interiors', 'referral', '', 'ep', 'ann', 24],
  ['orbit', 'Ethan Wright', 'Orbit Games', 'website', 'startup urgent', 'ep', 'nina', 20],
  ['helping', 'Ruth Moyo', 'Helping Paws Shelter', 'other', 'nonprofit', 'e', 'sofia', 17],
  ['crisp', 'Felix Wagner', 'Crisp Salads', 'telegram', 'ecommerce', 'ep', 'liam', 14],
  ['lighthouse', 'Nora Byrne', 'Lighthouse Tutors', 'website', 'startup', 'ep', 'max', 11],
  ['copper', 'Hugo Lambert', 'Copper Kettle Cafe', 'referral', '', 'ep', 'ann', 8],
  ['starling', 'Maya Patel', 'Starling Travel', 'website', 'b2b', 'ep', 'sofia', 6],
  ['clara', 'Clara Johansson', null, 'referral', '', 'e', 'nina', 4],
  ['quartz', 'Adam Fox', 'Quartz Jewelry', 'telegram', 'ecommerce urgent', 'ep', 'liam', 2.5],
  ['fern', 'Ivy Morgan', 'Fern Wellness', 'website', 'startup', 'ep', 'max', 0.4],
];

export const CLIENT_NOTES: Readonly<Record<string, string>> = {
  romashka: 'Flower shop with two locations. Prefers calls after 4 pm.',
  northwind: 'Five coffee shops. Daniel signs off on design, their finance team on budget.',
  brightline: 'Needs single sign-on with their Microsoft tenant. Procurement takes three weeks.',
  tinyfox: 'Ships across the EU. Their peak season starts in November.',
  lumen: 'Wants a minimal look with large photography. Hana answers email only.',
  ironbridge: 'Accessibility is in every contract: WCAG 2.2 AA.',
  petal: 'Same-day delivery in the city. Product photos are shot in-house.',
  riverbend: 'Lost on budget; worth a call when their new fiscal year starts.',
  velvet: 'The owner books everything by phone. Short messages, never long emails.',
  nova: 'Referred by Harbor Dental. Wants ordering for their partner clinics.',
  summit: 'Tax season runs from February to April: no launches then.',
  henry: 'Retired architect who wants a site for his watercolors.',
  copper: 'Two cafes in Lyon. The menu changes every season.',
};
