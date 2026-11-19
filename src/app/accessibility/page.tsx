export default function AccessibilityPage() {
  return (
    <main id="main" className="mx-auto min-h-[75vh] max-w-3xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">Accessibility</h1>
      <p className="mt-6 leading-relaxed">
        Our target is WCAG 2.2 AA. This foundation has semantic navigation,
        visible keyboard focus, a skip link, a match table, and support for
        reduced motion.
      </p>
      <h2 className="mt-10 text-2xl font-semibold">Current status</h2>
      <p className="mt-4 leading-relaxed">
        Conformance has not been certified. Automated axe checks cover the
        tournament list and match schedule. Manual screen reader, zoom,
        contrast, and native Android audits are still required before the final
        release.
      </p>
      <h2 className="mt-10 text-2xl font-semibold">Report a barrier</h2>
      <p className="mt-4 leading-relaxed">
        Open an accessibility issue in the project repository. Include the page,
        your assistive technology, the steps you took, and the expected
        behavior.
      </p>
      <a
        className="mt-6 inline-block underline underline-offset-4"
        href="https://github.com/MCK-D/openbracket/issues/new?template=bug.yml"
      >
        Report an accessibility issue
      </a>
    </main>
  );
}
