"use client";
import { Button } from "~/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="mx-auto min-h-[75vh] max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-semibold">This page could not be loaded</h1>
      <p className="my-6">
        The service may be temporarily unavailable. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
