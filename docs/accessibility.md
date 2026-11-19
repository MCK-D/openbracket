# Accessibility evidence and audit plan

Target: WCAG 2.2 AA for web and native Android. No conformance claim is made yet.

Implemented foundation: semantic landmarks, a skip link, visible focus, semantic links/buttons, form labels supplied by Auth.js, named navigation, table headers/captions for match schedules, readable contrast tokens, responsive layouts, reduced-motion support, self-hosted fonts, and a public accessibility statement.

Automated evidence: Playwright axe checks the tournament list and match schedule against WCAG 2 A/AA, 2.1 AA and 2.2 AA tags. Component tests preserve link semantics and disabled behavior. A browser check covers the first keyboard focus target and 390px horizontal overflow. These checks cannot certify full accessibility.

Manual release checklist (currently pending):

- Complete the spectator prediction journey using only the keyboard, including full-bracket entry when implemented.
- Test NVDA on Windows and TalkBack on Android. Verify concise, controlled live announcements.
- Check text and non-text contrast, information conveyed without color, 200% zoom, reflow at 320px, dynamic text and touch targets.
- Check validation messages associated with each field and actionable recovery suggestions.
- Confirm that the alternative match list is equivalent to every graphical bracket state, including corrections and byes.
- Record tool/device versions, dates, findings, severity, fixes, remaining limits and retest evidence in this directory.

Store actual screenshots, axe traces and manual findings with the associated issue or release. Update `/accessibility` with the attained level and known limitations after the audit. No load-test or mobile-audit results have been invented.
