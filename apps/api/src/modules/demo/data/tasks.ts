import type { People } from './people.js';

// From the reset: '-4d' four days before it, '+3h' three hours after.
export type Offset = `${'-' | '+'}${number}${'d' | 'h'}`;

export type TaskLink = `${'client' | 'deal'}:${string}`;

// remind: hours before the due time; a reminder before the reset was sent with a notification.
// done: hours after the due time, negative when early. read: hours after the reminder was sent;
// a sent reminder without it is unread.
export type TaskRow = readonly [
  title: string,
  people: People,
  link: TaskLink | null,
  created: Offset,
  due: Offset,
  remind?: number | null,
  done?: number | null,
  read?: number,
];

export const TASKS: readonly TaskRow[] = [
  ['Send the revised quote to Nova Dental Lab', 'ann', 'deal:nova-portal', '-4d', '-29h', 1],
  ['Call Lily about the showroom photos', 'ann', 'client:cedar', '-2d', '-7h', 1],
  ['Review the intranet contract with Hana', 'ann', 'deal:lumen-intranet', '-30h', '+3h', 1.5],
  ['Prepare the Copper Kettle kickoff', 'ann', 'deal:copper-site', '-20h', '+7h', 1],
  ['Check in with Paul at Riverbend', 'ann', 'client:riverbend', '-40h', '+36h', 2],
  ['Pipeline review with the team', 'ann', null, '-4d', '+3d', 1],
  ['Ask Northwind for a testimonial', 'ann', 'client:northwind', '-60h', '+4.5d'],
  ['Renew the studio domain and hosting', 'ann', null, '-8d', '+6d'],
  ['Send the Ironbridge invoice', 'ann', 'deal:ironbridge', '-58d', '-52d', 1, 2, 9],
  ['Call Paul about the portal budget', 'ann', 'deal:riverbend', '-77d', '-74.5d', 2, 2, 5],
  ['Confirm the Summit kickoff date', 'ann', 'deal:summit', '-12d', '-10d', 1, 3, 11],
  ['Interview a frontend contractor', 'ann', null, '-21d', '-15d', null, -2],
  ['Follow up on the Romashka proposal', 'max', 'deal:romashka-landing', '-6d', '-19h', 1],
  ['Call Ivy about the Fern Wellness brief', 'max', 'deal:fern-blog', '-6h', '+5h', 2.5],
  ['Prepare the holiday campaign mockups', 'ann>max', 'deal:tinyfox-holiday', '-3d', '+2d', 2],
  ['Visit Henry to talk about the site', 'max', 'client:henry', '-4d', '+4d'],
  ['Update the case studies page', 'ann>max', null, '-2d', '+5.5d'],
  ['Collect product photos from Tiny Fox', 'max', 'deal:tinyfox-store', '-154d', '-145d', 2, 3, 6],
  ['Draft the studio newsletter', 'ann>max', null, '-35d', '-30d', null, -1],
  ['Chase the Summit invoice', 'sofia', 'client:summit', '-5d', '-40h'],
  ['Send the tour sitemap to Maya', 'sofia', 'deal:starling-tours', '-4d', '+2.5d'],
  ['Draft the adoption page copy', 'sofia', 'deal:helping-pages', '-8d', '+5d'],
  ['Renew the font licenses', 'sofia', null, '-80d', '-78d', null, -4],
  ['Order test devices for the studio', 'sofia', null, '-121d', '-117d', null, -20],
  ['Set up the Brightline staging server', 'sofia', 'deal:tracking', '-182d', '-179d', null, -6],
  ['Prepare the monthly report', 'sofia', null, '-64d', '-62d', null, -3],
  ['Estimate the Quartz catalog', 'liam', 'deal:quartz-store', '-40h', '+1d'],
  ['Follow up on the Pinecone proposal', 'liam', 'deal:pinecone-rentals', '-6d', '+3.5d'],
  ['Migrate the Hearth product data', 'liam', 'deal:hearth', '-71d', '-68d', null, -10],
  ['Book the Crisp launch call', 'liam', 'deal:crisp', '-4d', '-30h', null, 2],
  ['Update the studio portfolio page', 'liam', null, '-42d', '-40d', null, -5],
  ['Call Grace about the donation form', 'ann>nina', 'deal:donations', '-3d', '+20h'],
  ['Collect book data from Bluebird', 'nina', 'deal:bluebird-shop', '-20h', '+4d'],
  ['Send the Ember launch checklist', 'nina', 'deal:ember-shop', '-23d', '-22d', null, 2],
  ['Write the Vertex case study', 'nina', null, '-104d', '-100d', null, -8],
  ['Clean up the shared drive', 'nina', null, '-3d', '-2d', null, -5],
];
