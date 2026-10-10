'use client';

import { useCallback, useState } from 'react';
import type { AgentUIMessage } from '@/agent/agent';
import { ActivityPanel } from './activity-panel';
import { Chat } from './chat';
import { useJobs } from './use-jobs';

export function AppShell({
  account,
  initialMessages,
}: {
  account: { email: string; name: string | null; gmailConnected: boolean; devTransport: boolean };
  initialMessages: AgentUIMessage[];
}) {
  const { data, loaded, refresh } = useJobs();
  const [panelOpen, setPanelOpen] = useState(false);
  const findJob = useCallback(
    (id: string) => data.upcoming.find((j) => j.id === id) ?? data.history.find((j) => j.id === id),
    [data],
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">O</div>
          <span className="font-semibold tracking-tight">Outreach Agent</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden items-center gap-1.5 text-muted sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${account.gmailConnected ? 'bg-emerald-500' : account.devTransport ? 'bg-amber-500' : 'bg-red-500'}`}
            />
            {account.email}
            {!account.gmailConnected && (account.devTransport ? ' · dev mode (emails are logged)' : ' · Gmail not connected')}
          </span>
          {!account.gmailConnected && !account.devTransport && (
            <a href="/api/auth/google" className="text-accent">Connect Gmail</a>
          )}
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="rounded-lg border border-line px-2.5 py-1 lg:hidden"
          >
            {panelOpen ? 'Chat' : `Scheduled (${data.upcoming.length})`}
          </button>
          <form action="/api/auth/logout" method="post">
            <button className="text-muted hover:text-foreground">Sign out</button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className={`${panelOpen ? 'hidden' : 'flex'} min-w-0 flex-1 lg:flex`}>
          <Chat initialMessages={initialMessages} findJob={findJob} onActivity={refresh} />
        </div>
        <aside
          className={`${panelOpen ? 'flex' : 'hidden'} w-full flex-col border-line bg-background lg:flex lg:w-[380px] lg:border-l`}
        >
          <ActivityPanel data={data} loaded={loaded} onChanged={refresh} />
        </aside>
      </div>
    </div>
  );
}
