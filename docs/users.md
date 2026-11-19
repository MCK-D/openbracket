# User guide

## What works now

Open the home page to browse three synthetic tournaments. Select **View tournament** to see its accessible match schedule. Times use UTC. A scheduled match becomes a scored result after a developer runs one demo simulation step and reloads the page. The Accessibility page explains the current audit status.

These are demonstration records. Do not enter real names, real player accounts, or other personal information. There are no wagers, purchases, cash rewards or valuable prizes.

## Spectators

Anyone can browse public tournaments without signing in. A synthetic spectator login is available through Auth.js when demo authentication is enabled; use alias `demo-spectator` at `/api/auth/signin`. Predictions, Pick'em answers, points, badges, friend groups and live updates are planned and are not yet available. Points will have no monetary value.

## Players

Tournament registration, team invitations, check-in, score reporting, evidence uploads and disputes are planned. The current match participants are fictional labels. There is no player account creation or registration button yet.

## Administrators

The typed backend includes an administrator-only tournament creation procedure with an audit entry. There is no administrator web form or demo administrator login. Game/stat configuration, stages, registration rules, scheduling, imports, disputes, prediction settings, question builder and projected dashboard are tracked as future stories. Do not treat the current format labels as working bracket engines.

## Android

The native demo client reads the same public tournament list and provides **Refresh tournaments**. Emulator setup is in [mobile.md](mobile.md). Predictions, groups and notifications are future mobile stories.

## Troubleshooting

If the list cannot load, reload after checking that the service and database are running. An empty list means that seed data has not been loaded in that environment. Ask a maintainer to run the documented seed command. Use the bug issue template for errors or accessibility barriers; include device/browser and steps but no secrets.
