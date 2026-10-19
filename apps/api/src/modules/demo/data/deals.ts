import type { Currency } from '@clientry/shared/deals';

import type { People, PersonKey } from './people.js';

// New, Call, Proposal sent, Contract, Paid (won), Lost.
export type StageCode = 'N' | 'C' | 'P' | 'K' | 'W' | 'L';

// Every deal starts in New. Each step names the stage it moves to and the days since the previous
// event, as in 'C3 P5 W12': Call three days after creation, Proposal sent five days later.
export type DealStory = readonly [
  key: string,
  client: string,
  title: string,
  // Major units; the builder stores minor ones.
  amount: number,
  people: People,
  startedDaysAgo: number,
  steps: string,
  currency?: Currency,
];

// Within each stage the board shows them in this order.
export const DEAL_STORIES: readonly DealStory[] = [
  ['fern-blog', 'fern', 'Wellness blog for Fern Wellness', 1200, 'max', 0.3, ''],
  ['quartz-store', 'quartz', 'Online store for Quartz Jewelry', 6800, 'liam', 2, ''],
  ['clara-portfolio', 'clara', 'Portfolio for Clara Johansson', 800, 'nina', 3.5, ''],
  ['starling-tours', 'starling', 'Tour booking site for Starling', 9200, 'sofia', 5, ''],
  ['copper-site', 'copper', 'Website for Copper Kettle Cafe', 2200, 'ann', 7, '', 'EUR'],
  ['lighthouse-booking', 'lighthouse', 'Tutor booking for Lighthouse', 3400, 'max', 10, 'C2'],
  ['helping-pages', 'helping', 'Adoption pages for Helping Paws', 1600, 'sofia', 16, 'C3'],
  ['kite-rebrand', 'kite', 'Rebrand site for Kite Studio', 4300, 'liam', 20, 'C2'],
  ['henry-site', 'henry', 'Watercolor site for Henry Adams', 900, 'max', 26, 'C6'],
  ['bluebird-shop', 'bluebird', 'Online bookshop for Bluebird Books', 5800, 'liam', 30, 'C4'],
  ['romashka-landing', 'romashka', 'Landing page for Romashka', 1500, 'max', 12, 'C2 P3'],
  ['cedar-showroom', 'cedar', 'Showroom site for Cedar & Co', 6400, 'ann>sofia', 18, 'P7', 'EUR'],
  ['pinecone-rentals', 'pinecone', 'Gear rental shop for Pinecone', 7600, 'liam', 22, 'P9'],
  ['nova-portal', 'nova', 'Order portal for Nova Dental Lab', 9200, 'ann', 25, 'C3 P6'],
  ['tinyfox-holiday', 'tinyfox', 'Holiday campaign for Tiny Fox', 2900, 'max', 28, 'P8 K6'],
  ['green-delivery', 'green', 'Delivery landing for Greenleaf', 3900, 'liam', 30, 'P9 K7'],
  ['lumen-intranet', 'lumen', 'Intranet for Lumen Architects', 13500, 'ann', 35, 'P6 K12'],
  ['donations', 'openhands', 'Donation site for Open Hands', 3000, 'ann>nina', 40, 'C5 P7 K9'],
  ['crisp', 'crisp', 'Ordering widget for Crisp Salads', 1900, 'liam', 13, 'C2 P3 W7.2', 'EUR'],
  ['summit', 'summit', 'Client portal for Summit Accounting', 11800, 'sofia', 30, 'C3 P6 W12'],
  ['ember-shop', 'ember', 'Subscription shop for Ember Coffee', 7400, 'nina', 41, 'C3 P6 W11'],
  ['nw-loyalty', 'northwind', 'Loyalty app landing for Northwind', 2400, 'ann>max', 52, 'P6 K5 W7'],
  ['atlas-calculator', 'atlas', 'Quote calculator for Atlas Movers', 3600, 'nina', 70, 'P9 K6 W8'],
  ['ironbridge', 'ironbridge', 'Website refresh for Ironbridge', 5400, 'ann', 80, 'P8 K11 W6'],
  ['hearth', 'hearth', 'Store migration for Hearth Home', 8900, 'liam', 88, 'C4 P6 W12', 'EUR'],
  ['cobalt', 'cobalt', 'Investor landing for Cobalt Robotics', 4800, 'sofia', 94, 'P5 K5 W6'],
  ['petal-store', 'petal', 'Online store for Petal & Stem', 5600, 'nina', 100, 'C2 P4 W6', 'EUR'],
  ['maple-orders', 'maple', 'Ordering page for Maple Street', 1800, 'max', 139, 'C5 P12 W27'],
  ['vertex-site', 'vertex', 'Marketing site for Vertex Analytics', 9800, 'nina', 133, 'C3 P7 W16'],
  ['quill-catalog', 'quill', 'Product catalog for Quill & Ink', 2800, 'liam', 144, 'C4 P10 W14'],
  ['lumen-portfolio', 'lumen', 'Portfolio site for Lumen Architects', 7200, 'ann', 150, 'P6 K7 W9'],
  ['tinyfox-store', 'tinyfox', 'Online store for Tiny Fox Toys', 5400, 'max', 168, 'P9 K8 W12'],
  ['harbor-booking', 'harbor', 'Booking site for Harbor Dental', 3200, 'nina', 174, 'C5 P8 W14'],
  ['green-orders', 'green', 'Online ordering for Greenleaf', 4200, 'liam', 179, 'P7 K6 W9'],
  ['tracking', 'brightline', 'Shipment tracking portal', 12500, 'sofia', 185, 'P6 K5 W8'],
  ['nw-redesign', 'northwind', 'Website redesign for Northwind', 6800, 'ann', 190, 'C3 P5 W10'],
  ['spring-sale', 'romashka', 'Spring sale page for Romashka', 900, 'max', 196, 'C2 P5 W12'],
  ['orbit-launch', 'orbit', 'Launch site for Orbit Games', 9500, 'nina', 18, 'C3 L9'],
  ['tidal-booking', 'tidal', 'Lesson booking for Tidal Surf School', 2600, 'max', 45, 'P6 L12'],
  ['velvet-booking', 'velvet', 'Booking page for Velvet Room', 1200, 'sofia', 64, 'C4 L8'],
  ['riverbend', 'riverbend', 'Patient portal for Riverbend Clinic', 14000, 'ann', 82, 'C3 P5 L4'],
  ['aurora-app', 'aurora', 'Class schedule app for Aurora Yoga', 3800, 'max', 112, 'C4 L7'],
  ['seaside', 'seaside', 'Booking engine for Seaside', 8200, 'sofia', 127, 'C2 L3', 'EUR'],
  ['bolt-members', 'bolt', 'Membership site for Bolt Fitness', 4500, 'sofia>liam', 157, 'C4 L9'],
  ['driver-app', 'brightline', 'Driver app for Brightline', 15000, 'sofia', 184, 'C3 L12'],
];

export type DealChangeRow = { readonly amount: number } | { readonly assignee: PersonKey };

// Made by the deal's creator: deal key, days before the reset, the new amount or assignee.
export const DEAL_UPDATES: readonly (readonly [deal: string, daysAgo: number, DealChangeRow])[] = [
  ['lumen-portfolio', 140, { assignee: 'sofia' }],
  ['ironbridge', 60, { amount: 6100 }],
  ['bluebird-shop', 24, { assignee: 'nina' }],
  ['nova-portal', 9, { amount: 10400 }],
];
