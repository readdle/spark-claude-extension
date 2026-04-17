---
name: spark
description: >-
  Use the Spark MCP extension to access the user's Spark email data - list
  emails, search by topic, read threads, check calendar events, find
  availability, look up contacts, and view team info. Use when the user asks
  about their emails, calendar, contacts, meetings, or scheduling.
metadata:
  version: 1.0.0
  requires:
    mcp:
      - spark
---

# Using Spark

The Spark MCP extension exposes the user's mailbox, calendar, contacts, meetings, and team data as tools. Use it to answer questions about their Spark data.

The connection is read-only - you cannot send mail, reply, archive, snooze, assign, comment, or categorize anything. If the user asks for a mutation, explain it is not available and point them at Spark Desktop.

## Calling tools

Each tool is an MCP tool exposed by the `spark` server. Examples below use the notation:

```
tool_name { "param": "value", ... }
```

Map this to your runtime's tool-call syntax - the left side is the MCP tool name, the right side is the JSON arguments object.

Always call `accounts` once at the start of any non-trivial task to discover available accounts, calendars, teams, and shared inboxes. Call `folders` before passing folder identifiers to `emails` or `search`.

## Tools

| Tool | Description |
|------|-------------|
| `accounts` | List accounts, calendars, teams, shared inboxes |
| `folders` | List folders/labels with message counts |
| `emails` | List emails with filters and pagination |
| `search` | Hybrid keyword + semantic search with full bodies |
| `thread` | Read full thread - headers, bodies, attachments |
| `events` | List calendar events for a time range |
| `availability` | Find free time slots, optionally with attendees |
| `contacts` | Search contacts by name or email |
| `team` | Show team info, members, shared inboxes, assignments |
| `meetings` | List meeting transcripts |
| `meeting` | Read a single meeting transcript |

### accounts

List all configured accounts with their calendars, teams, and shared inboxes. Takes no parameters. Run first to discover what is available.

```
accounts {}
```

### folders

List folders with message counts. Output includes folder identifiers in parentheses - use those as the `folder` parameter for `emails` and as scope for `search`. Mailboxes backed by a Google account show `(Gmail labels)` on the **Email Account** or **Shared Inbox** header. Teams show the team name as a usable identifier for `emails`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account` | string | no | Filter by email address (account or shared inbox). All accounts if omitted. |

```
folders {}
folders { "account": "user@example.com" }
```

### emails

List emails with metadata (ID, From, Date, Subject, Flags). Supports pagination and Gmail-style filters. Does **not** return bodies - use `search` or `thread` when you need content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folder` | string | no | Folder identifier. Unified Inbox if omitted. |
| `filter` | string | no | Gmail-style filter (see operators below). |
| `page` | integer | no | Page number, 1-based (default `1`). |
| `page_size` | integer | no | Results per page (default `50`). |
| `order` | string | no | `ascending` or `descending`. |
| `new_senders` | boolean | no | Show only new-sender emails (GateKeeper). |

```
emails {}                                                                         # Unified Inbox
emails { "folder": "user@example.com:Archive" }                                   # specific folder
emails { "folder": "My Team" }                                                    # team's shared threads
emails { "filter": "from:alice@co.com is:unread" }
emails { "filter": "newer_than:7d has:attachment" }
emails { "page": 2, "page_size": 20 }
emails { "order": "ascending" }
emails { "new_senders": true }
```

**GateKeeper:** When viewing the Inbox with GateKeeper in explicit mode, new-sender emails are filtered out and a "New Senders" count is shown at the top. Set `new_senders: true` to view them.

**Folder identifier formats** (call `folders` to see available ones):

| Format | Example | Meaning |
|--------|---------|---------|
| Bare name | `Inbox`, `Archive` | Unified folder (cross-account) |
| Email | `user@example.com` | Account inbox shorthand |
| `email:Folder` | `user@example.com:Archive` | Specific account folder |
| Team name | `My Team` | All shared threads in a team |
| `shared@email:Folder` | `shared@co.com:Inbox` | Shared inbox folder |

**Filter operators** (combine space-separated inside the `filter` string):

| Operator | Example |
|----------|---------|
| `from:<addr>` | `from:alice@co.com` |
| `to:<addr>` | `to:bob@co.com` |
| `cc:<addr>` | `cc:team@co.com` |
| `subject:<text>` | `subject:"quarterly report"` |
| `before:yyyy/MM/dd` | `before:2026/03/01` |
| `after:yyyy/MM/dd` | `after:2026/01/01` |
| `newer_than:Xd` | `newer_than:7d` (also `w`, `m`, `y`) |
| `older_than:Xd` | `older_than:30d` |
| `has:attachment` | also `document`, `spreadsheet`, `presentation`, `reminder` |
| `is:unread` | also `read`, `starred`, `pinned`, `unreplied` |
| `is:shared` | emails shared to any team |
| `is:shared_inbox_open` | open items in shared inbox |
| `is:shared_inbox_done` | completed/closed items in shared inbox |
| `category:<name>` | `priority`, `personal`, `notification`, `newsletter`, `invitation`, `invitation_response` |
| `assigned_to:<who>` | `me`, `<email>`, `unassigned`, `other` |
| `assigned_by:me` | emails you delegated |
| `filename:<name>` | `filename:report.pdf` |

### search

Hybrid keyword + semantic search. Returns up to 20 emails **with full bodies**, sorted by relevance. Use this when the user asks about a topic.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search topic (keyword + semantic matching). |
| `filter` | string | no | Gmail-style filter to narrow results. |
| `in` | string | no | Scope: account, folder, team, or shared inbox. All folders if omitted. |

```
search { "query": "quarterly report" }
search { "query": "API integration", "filter": "from:alice@co.com" }
search { "query": "budget", "in": "user@example.com:Archive" }
search { "query": "vacation", "in": "user@example.com" }
```

Use `search` when the user asks about a topic (you need bodies). Use `emails` when listing or filtering by metadata.

### thread

Read every message in a conversation - headers, plain-text bodies, attachment info. After the thread summary line, lists custom (non-system) folder labels once for the whole thread.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | yes | ID of a message in the thread (from `emails` or `search`). |
| `download_attachments` | boolean | no | Fetch attachments that aren't yet local. |

```
thread { "message_id": "1114" }
thread { "message_id": "1114", "download_attachments": true }
```

Find IDs with `emails` or `search` first, then call `thread` to read the full conversation.

### events

List calendar events for a time range. Defaults to today's remaining events.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `today` | boolean | no | From now until end of today. |
| `tomorrow` | boolean | no | Tomorrow, full day. |
| `week` | boolean | no | From now until end of this week. |
| `start` | string | no | Start date (`yyyy-MM-dd` or `yyyy-MM-ddTHH:mm`). |
| `end` | string | no | End date (same formats). |
| `in` | string | no | Calendar account (`user@example.com`) or specific calendar (`user@example.com:Work`). |

```
events {}
events { "tomorrow": true }
events { "week": true }
events { "week": true, "in": "user@example.com" }
events { "week": true, "in": "user@example.com:Work" }
events { "start": "2026-03-16", "end": "2026-03-20" }
```

Call `accounts` to see available calendar accounts and calendar names.

### availability

Find free time slots. Without `attendees`, shows the user's own availability. With `attendees`, computes mutual free windows. Working hours are 08:00-20:00, weekends skipped, events marked "free" are ignored.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `today` | boolean | no | From now until end of today. |
| `tomorrow` | boolean | no | Tomorrow, full day. |
| `week` | boolean | no | From now until end of this week. |
| `start` | string | no | Start date (`yyyy-MM-dd` or `yyyy-MM-ddTHH:mm`). |
| `end` | string | no | End date (same formats). |
| `attendees` | string | no | Comma-separated email addresses. |

```
availability {}
availability { "tomorrow": true }
availability { "week": true, "attendees": "alice@co.com" }
availability { "start": "2026-03-16", "end": "2026-03-20", "attendees": "a@co.com,b@co.com" }
```

### contacts

Search contacts by name or email. Strict match first, then fuzzy fallback.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Name or email to search for. |

```
contacts { "query": "john" }
contacts { "query": "example.com" }
```

### team

Show team info - metadata, shared inboxes with members, full member list, assigned emails, and assignment summary. Call without `name` to list available teams.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | no | Team name (or partial match). Lists all teams if omitted. |

```
team {}
team { "name": "My Team" }
```

### meetings

List meeting transcripts, newest first. Supports filtering and pagination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter` | string | no | Filter expression (operators below). |
| `page` | integer | no | Page number, 1-based. |
| `page_size` | integer | no | Results per page (default `50`). |

```
meetings {}
meetings { "filter": "newer_than:30d" }
meetings { "filter": "subject:standup", "page_size": 10 }
```

Filter operators for `meetings`: `subject:<text>`, `before:yyyy/MM/dd`, `after:yyyy/MM/dd`, `newer_than:Xd`, `older_than:Xd`.

### meeting

Read a single meeting transcript's summary. Optionally include the full transcript and/or user notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `meeting_id` | string | yes | Meeting ID (find via `meetings`). |
| `transcript` | boolean | no | Include the full transcript text. |
| `notes` | boolean | no | Include user notes. |

```
meeting { "meeting_id": "42" }
meeting { "meeting_id": "42", "transcript": true }
meeting { "meeting_id": "42", "notes": true }
meeting { "meeting_id": "42", "transcript": true, "notes": true }
```

## Smart Categories

Spark automatically classifies incoming email into six categories. Use the `category:` filter operator with `emails` and `search` to view mail by category.

| Category | Filter | Typical Content |
|----------|--------|-----------------|
| Priority | `category:priority` | Auto-prioritized or manually marked as priority |
| People | `category:personal` | Direct person-to-person email |
| Notifications | `category:notification` | Service notifications, alerts, receipts |
| Newsletters | `category:newsletter` | Subscriptions, digests, marketing |
| Invites | `category:invitation` | Calendar invitations |
| Invite Responses | `category:invitation_response` | RSVPs, accepts, declines |

Browse by category:

```
emails { "folder": "Inbox", "filter": "category:priority is:unread" }
emails { "folder": "Inbox", "filter": "category:personal is:unread" }
emails { "folder": "Inbox", "filter": "category:invitation" }
emails { "folder": "Inbox", "filter": "category:notification is:unread" }
emails { "folder": "Inbox", "filter": "category:newsletter newer_than:7d" }
```

**Category-first review pattern:** Process inbox in priority order - priority → people → invites → notifications → newsletters. This ensures the most important messages get attention first.

## Typical Workflows

**Answer a question about emails:**
1. `search { "query": "topic" }` - find relevant emails with bodies.
2. Read the output and answer the user's question.

**Find and read a specific email:**
1. `emails { "filter": "from:sender subject:keyword" }` - locate the email.
2. `thread { "message_id": "<ID>" }` - read the full conversation.

**Check someone's schedule for a meeting:**
1. `availability { "tomorrow": true, "attendees": "alice@co.com,bob@co.com" }`.
2. Suggest a time from the free slots.

**Get team workload overview:**
1. `team { "name": "Team Name" }` - see members and assigned emails.

**Look up a contact:**
1. `contacts { "query": "name or domain" }` - find their email address.

**Review assigned shared inbox items:**
1. `emails { "folder": "shared@co.com:Inbox", "filter": "assigned_to:unassigned" }` - unassigned items.
2. `emails { "filter": "assigned_to:bob@co.com" }` - items assigned to a teammate.
3. `emails { "filter": "is:shared_inbox_open" }` - all open shared inbox items.
4. `emails { "filter": "is:shared_inbox_done" }` - completed items.

**Read meeting notes:**
1. `meetings { "filter": "newer_than:30d" }` - find recent meetings.
2. `meeting { "meeting_id": "<ID>", "transcript": true, "notes": true }` - read summary, transcript, and notes.

## Tips

- Combine filter operators into a single `filter` string: `"from:alice@co.com is:unread newer_than:7d"` - do not split them across calls.
- Call `folders` to discover exact folder identifiers before passing them to `emails` or `search`'s `in` parameter.
- Call `accounts` to discover calendar identifiers before passing them to `events`'s `in` parameter.
- Use `search` for topic-based queries - it returns bodies. Use `emails` for browsing or slicing by metadata - it does not.
- Use `thread` after finding an interesting message ID with `emails` or `search`.
- Multi-word subjects and team names must be quoted inside the filter string: `subject:"quarterly report"`.
- This connection is read-only. If the user asks you to send, reply, archive, snooze, assign, comment, or categorize - explain the limitation and point them at Spark Desktop.
