import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        AI <span className="text-accent">Fluency</span>
      </h1>
      <p className="mt-1 text-sm text-muted">Enter your passcode to keep studying.</p>
      <SignInForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
