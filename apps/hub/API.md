# Preparing connected activities

Hub is a client of the tools' ordinary resource APIs. Its private adapters do not
start rounds, publish results, read participant writing or transfer browser roles.

## Installation

Set `HUB_POLYMIND_TOKEN` to Polymind's existing `OPERATOR_TOKEN` and
`HUB_PUCK_TOKEN` to Puck's optional `PUCK_OPERATOR_TOKEN`. Keep these runtime secrets
server-side. Both require at least 32 characters. Missing tokens disable API
preparation for that app without disabling manual invitations.

Set `HUB_POLYMIND_ORIGIN` / `HUB_PUCK_ORIGIN` for non-default deployments. Add each
verified participant origin to `HUB_ALLOWED_ORIGINS`; configuring credentials does
not implicitly expand this allowlist. Outbound requests use only these fixed HTTPS
origins, do not follow redirects, have bounded responses/timeouts, and never expose
upstream errors or tokens to the browser.

## Operator flow

In **Prepare activities**, select or add an invitation, choose the digital activity
type and an app, then select an existing activity or expand **Create a new activity**.
Polymind takes a session name and capacity; Puck takes a question and two to six
options (baseline mode). **Connect selected activity** / **Create and connect** save
the participant destination through the usual revision-checked invitation save.
The current invitation does not change unless the invitation being edited is already
live; that requires confirmation. Detailed app setup and live actions remain in
**App controls**. Manual links are under **Advanced: participant link**.

Creating an app resource and saving the Hub invitation are separate operations.
If the second fails, the app resource remains available. Retry with the same
settings or select it from the list. Browser session storage retains one pending
request per app across reloads, including its settings. Successful connection
retires it. Starting a different request is explicit and may create another resource.
The apps persist creation keys with their resources so retries survive their restart.

Hub stores no extra connection secrets or app metadata in the programme. It derives
the app/session from the validated participant destination, retaining schema 1.
Existing manual destinations for recognised sessions can also report app status.

## Private Hub API

All routes require Hub operator authentication. POST also requires the configured
Hub Origin and JSON content type. GET `/api/operator/config` reports only connection
availability, not credentials.

| Route | Behaviour |
| --- | --- |
| `GET /api/operator/apps/{app}/sessions` | List up to 200 resource summaries |
| `GET /api/operator/apps/{app}/sessions/{id}` | Read one resource's status |
| `POST /api/operator/apps/{app}/sessions` | Create/recover using `{requestId, settings}`, then read the resource back |

Responses contain only `id`, `title`, `url`, `status`, `checkedAt`. App destinations
are reconstructed from configured origins and validated resource IDs. These
endpoints never modify the Hub programme; its existing PUT remains authoritative.

Status checks run after loading/saving and every 15 seconds while the tab is visible.
Failed checks retain a labelled last-known result; they are not health guarantees.
An unavailable app does not prevent showing a waiting or in-person instruction.

## App contracts

- Polymind: ordinary `/api/operator/sessions` collection and individual session
  resource. See [Polymind API](../polymind/docs/session-api.md).
- Puck: ordinary `/api/rooms` collection and room resource. See
  [Puck API](../puck/docs/operator-api.md). Its own operator UI uses the same routes.

No shared runtime code or sibling checkout is required. Installing the updated apps
and configuring credentials is a deployment task; changing this source does not
configure or deploy a live installation.
