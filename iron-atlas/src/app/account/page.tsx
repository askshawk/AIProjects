import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userPrograms } from "@/db/schema";
import {
  authenticate,
  createSession,
  destroySession,
  getCurrentUser,
  registerUser,
} from "@/lib/auth";

export const metadata = { title: "Account · Iron Atlas" };

async function signIn(formData: FormData) {
  "use server";
  const result = await authenticate(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!result.ok)
    redirect(`/account?error=${encodeURIComponent(result.error)}`);
  await createSession(result.userId);
  redirect("/train");
}

async function signUp(formData: FormData) {
  "use server";
  const result = await registerUser(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!result.ok)
    redirect(`/account?error=${encodeURIComponent(result.error)}`);
  await createSession(result.userId);
  redirect("/train");
}

async function signOut() {
  "use server";
  await destroySession();
  redirect("/account");
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const user = await getCurrentUser();

  if (user) {
    const programs = await db
      .select({
        id: userPrograms.id,
        title: userPrograms.title,
        status: userPrograms.status,
        startedAt: userPrograms.startedAt,
      })
      .from(userPrograms)
      .where(eq(userPrograms.userId, user.id))
      .orderBy(asc(userPrograms.startedAt));

    return (
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {user.email}</p>
        </div>

        <div className="rounded-lg border bg-surface p-4">
          <h2 className="text-sm font-medium">Your programs</h2>
          {programs.length === 0 ? (
            <p className="mt-1 text-sm text-muted">
              None yet. Pick one from the library and hit &ldquo;Start this
              program&rdquo;.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {programs.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span>{p.title}</span>
                  <span className="text-muted">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted">
          You need an account to run a program and log your sets. Browsing and
          exporting work without one.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <form className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            formAction={signIn}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            Sign in
          </button>
          <button
            type="submit"
            formAction={signUp}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Create account
          </button>
        </div>
      </form>
    </div>
  );
}
