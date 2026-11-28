# Request to the Notification Hub: groups through a company's own LINE OA

From: iExcellence Portal team
To: Notification Hub team
Date: 2026-11-28
Related: docs/HUB-GROUPS-REQUEST.md (Admin API `/api/admin`, live since 2026-11-24)

## 1. Why

Customers want group notifications sent from **their own LINE Official Account** instead of Iex.Notification,
with the message quota counted on their own LINE plan (the Multi-Channel Broadcast demo has the same idea).

A person links LINE with their email, but **a LINE group has no email**. So for groups, the company's OA
credentials are what connect the company to the Hub:

- Portal **stores** the credentials (encrypted) **and hands them to the Hub** when a company admin saves them.
- Portal **sends the OA's channel access token with every group push**.

Personal notifications (`/v1/events`, `/v1/link-keys`) do not change: people keep linking by email with Iex.Notification.

## 2. What Portal already does (built 2026-11-28, `src/lib/line-oa.ts`)

1. A company admin opens Notification channels › Notification groups › "+ Use our own LINE OA" and enters
   **Channel ID**, **Channel secret** and a **long-lived Channel access token**.
2. Portal checks the token with LINE (`GET /v2/bot/info`, and `GET /oauth2/v2.1/verify` to confirm the token belongs
   to that Channel ID), then stores all three AES-256-GCM encrypted.
3. Portal calls API A below. If the Hub answers with a `webhookUrl`, Portal points the OA's webhook at it through
   LINE's API (`PUT /v2/bot/channel/webhook/endpoint`), so the customer doesn't have to copy it.
4. Until the Hub has API A, Portal shows "saved · the Hub doesn't support company OAs yet" (a 404 is treated as
   not ready) and offers "Send to the Hub again".
5. Every push to a group of that company carries `line` (API C). Companies without their own OA send exactly what
   they send today (no `line` field), so nothing changes for them.

## 3. APIs we need (Admin API, same base URL and `x-admin-key` header as today)

### A. Save the company's OA: `PUT /line-channel`

```json
{
  "company": "acme",
  "departmentId": 12,
  "channelId": "2001234567",
  "channelSecret": "0123456789abcdef0123456789abcdef",
  "accessToken": "<long-lived channel access token>"
}
```

Replaces any OA saved earlier for that company. Answer `200`:

```json
{ "webhookUrl": "https://notify.iexcellence.cloud/webhook/line/<something per OA>" }
```

The Hub should use the **channel secret to verify the signature** of webhooks from that OA, and register groups
from that OA (`/register <code>` with a code from `POST /group-codes`) to the company's department as today.
`departmentId` is the company's department from `GET /departments?company=` (Portal creates it if missing).

### B. Remove it: `DELETE /line-channel?company=acme`

The company goes back to Iex.Notification. `404` when nothing was saved is fine.

### C. Push into a group: `POST /push-group` gets an optional `line`

```json
{
  "groupId": "C0123…",
  "text": "…",
  "line": { "channelId": "2001234567", "accessToken": "<token>" }
}
```

- With `line`: push through that OA using that token.
- Without `line`: unchanged (Iex.Notification).
- If LINE answers 401 for the token, please reply `{ "error": "line_token_invalid" }` so Portal can ask the admin
  for a new token.
- Groups registered through Iex.Notification before the company switched are not in the company OA's chats; please
  answer `no_active_group` for those (Portal then shows "the bot is no longer in this group").

### D. (nice to have) `memberCount` in `GET /groups`

LINE counts group messages per member. With a member count Portal can show the expected quota use before sending.

## 4. Questions

1. Do the endpoint names / fields above work for you, or will you send your own spec? Portal adjusts
   `putHubLineChannel`, `deleteHubLineChannel` and `pushHubGroup` in `src/lib/hub.ts`.
2. Is the Hub keeping the token too (for its own retries), or only using the one in each push?
3. When will Telegram groups be added?
