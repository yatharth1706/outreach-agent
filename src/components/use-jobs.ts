'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SerializedJob } from '@/lib/emails';

export type JobsData = { upcoming: SerializedJob[]; history: SerializedJob[] };

const POLL_MS = 5000;

/** Activity data, polled so status changes made by the scheduler show up without a reload. */
export function useJobs() {
  const [data, setData] = useState<JobsData>({ upcoming: [], history: [] });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/jobs', { cache: 'no-store' });
    if (res.ok) {
      setData(await res.json());
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { data, loaded, refresh };
}
