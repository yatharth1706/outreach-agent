import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { loadChat } from '@/lib/chats';
import { getSessionAccount } from '@/lib/session';

export default function Home({ searchParams }: PageProps<'/'>) {
  // Everything here is per-user, so it renders at request time inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const account = await getSessionAccount();
  if (!account) {
    const { error } = await searchParams;
    return <SignIn error={typeof error === 'string' ? error : undefined} />;
  }

  const messages = await loadChat(account.id);
  return (
    <AppShell
      account={{
        email: account.email,
        name: account.name,
        gmailConnected: Boolean(account.refreshTokenEnc),
        devTransport: process.env.EMAIL_TRANSPORT === 'log' && process.env.NODE_ENV !== 'production',
      }}
      initialMessages={messages}
    />
  );
}

function SignIn({ error }: { error?: string }) {
  const dev = process.env.NODE_ENV === 'development';
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">O</div>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach Agent</h1>
        <p className="mt-2 text-sm text-muted">
          Tell it who to email and when, in plain English. It drafts the email, you approve it, and it goes out
          from your Gmail on time.
        </p>
        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <a
          href="/api/auth/google"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Sign in with Google
        </a>
        <p className="mt-3 text-xs text-muted">
          Asks for permission to send email on your behalf. It never reads your inbox.
        </p>
        {dev && (
          <a href="/api/auth/dev" className="mt-6 block text-center text-xs text-muted underline">
            Dev sign-in (no Google)
          </a>
        )}
      </div>
    </main>
  );
}
