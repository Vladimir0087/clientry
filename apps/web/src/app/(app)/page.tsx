import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { HomeGreeting } from './_components/home-greeting';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage(): ReactNode {
  return <HomeGreeting />;
}
