'use client';

import { useEffect } from 'react';
import { installScrollBehavior } from '../lib/scroll-behavior';

export function ScrollBehavior() {
  useEffect(() => installScrollBehavior(window), []);
  return null;
}
