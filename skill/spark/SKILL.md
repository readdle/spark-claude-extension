---
name: spark
description: >-
  Use the Spark MCP extension to access and act on the user's Spark email
  data - list emails, search by topic, read threads, check calendar events,
  find availability, look up contacts, view team info, draft messages, post
  team comments, triage threads, and manage contacts. Use when the user asks
  about their emails, calendar, contacts, meetings, scheduling, or wants to
  send, reply, archive, snooze, assign, comment, or categorize.
metadata:
  version: 1.1.0
  requires:
    mcp:
      - spark
---

# Using Spark

The Spark MCP extension exposes the user's mailbox, calendar, contacts, meetings, and team data as tools. Use it to answer questions about their Spark data and, when the account allows it, to act on it - draft messages, post team comments, triage threads, and manage contacts.

## Access levels

Each account and shared inbox has its own **access level**, configured by the user in Spark Desktop under **Settings > AI Agents**. The `accounts` tool reports the current level for every account and shared inbox.

| Level | Allowed operations |
|-------|-------------------|
| **read-only** | List, search, and read emails, threads, folders, events, contacts, meetings, teams |
| **triage** | Everything in read-only plus all write operations: `draft`, `comment`, `action`, `contact-action` |

Shared inboxes can have a different access level than the parent account - for example, a personal account may have triage access while a shared inbox under the same team is read-only or disabled.

If a write tool is invoked against an account with insufficient access, the call returns a descriptive error explaining how to raise the level. Pass that on to the user verbatim and offer to retry once they have updated the setting, or perform the action in Spark Desktop directly.

## Calling tools

Each tool is an MCP tool exposed by the `spark` server. Examples below use the notation:

```
tool_name { "param": "value", ... }
```

Map this to your runtime's tool-call syntax - the left side is the MCP tool name, the right side is the JSON arguments object.

Always call `accounts` once at the start of any non-trivial task to discover available accounts, calendars, teams, shared inboxes, and access levels. Call `folders` before passing folder identifiers to `emails` or `search`.

## Tools

| Tool | Access | Description |
|------|--------|-------------|
| `accounts` | read-only | List accounts, calendars, teams, shared inboxes, and access levels |
| `folders` | read-only | List folders/labels with message counts |
| `emails` | read-only | List emails with filters and pagination |
| `search` | read-only | Hybrid keyword + semantic search with full bodies |
| `thread` | read-only | Read full thread - headers, bodies, attachments |
| `events` | read-only | List calendar events for a time range |
| `availability` | read-only | Find free time slots, optionally with attendees |
| `contacts` | read-only | Search contacts by name or email |
| `team` | read-only | Show team info, members, shared inboxes, assignments |
| `meetings` | read-only | List meeting transcripts |
| `meeting` | read-only | Read a single meeting transcript |
| `draft` | triage | Create or edit an email draft (new, reply, forward) |
| `comment` | triage | Post a team comment on a thread |
| `action` | triage | Perform actions on emails (archive, pin, snooze, assign, etc.) |
| `contact-action` | triage | Perform actions on contacts (block, accept, categorize, etc.) |

### accounts

List all configured accounts with their calendars, teams, and shared inboxes. Output reports each account's and shared inbox's **access level** - check this before attempting any write tool. Takes no parameters.

```
accounts {}
```

Run first to discover what is available and which accounts allow triage actions.

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

**GateKeeper:** When viewing the Inbox with GateKeeper in explicit mode, new-sender emails are filtered out and a "New Senders" count is shown at the top. Set `new_senders: true` to view them. Use `contact-action` with `acceptContact` or `blockContact` to accept or block a sender (requires triage).

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

### draft

**Requires triage access.**

Create a new email draft or edit an existing one. The body is markdown and is converted to HTML. Use `reply_to` or `forward` to seed the draft from an existing message; use `edit` to update an existing draft.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | array of string | no | Recipient addresses. |
| `cc` | array of string | no | CC addresses. |
| `bcc` | array of string | no | BCC addresses. |
| `subject` | string | no | Subject line. |
| `body` | string | no (yes for new) | Body content in markdown. Required when creating a new draft. |
| `account` | string | no | Account email to send from. Personal accounts, aliases, and shared-inbox emails are all valid - any account that has triage access. |
| `edit` | integer | no | Message ID of an existing draft to update. |
| `reply_to` | integer | no | Message ID to reply to. |
| `forward` | integer | no | Message ID to forward. |
| `attach` | array of string | no | Absolute paths to files to attach. |

```
draft { "to": ["alice@example.com"], "subject": "Hello", "body": "Hi Alice, ..." }
draft { "to": ["alice@co.com", "bob@co.com"], "cc": ["carol@co.com"], "subject": "Meeting", "body": "..." }
draft { "edit": 1234, "subject": "Updated subject", "body": "Updated body" }
draft { "reply_to": 5678, "body": "Thanks for the update!" }
draft { "forward": 5678, "to": ["manager@co.com"], "body": "FYI" }
draft { "account": "john@gmail.com", "to": ["alice@co.com"], "subject": "Hi", "body": "..." }
draft { "to": ["alice@co.com"], "subject": "Report", "body": "See attached", "attach": ["/path/to/report.pdf"] }
draft { "to": ["alice@co.com"], "subject": "Files", "body": "Two files", "attach": ["/path/to/a.pdf", "/path/to/b.xlsx"] }
```

Use `emails` to find message IDs for `edit`, `reply_to`, and `forward`. Use `accounts` to find account emails for `account` - both personal accounts and shared inboxes are listed there, and either can be used as the from address when the account has triage access.

### comment

**Requires triage access.**

Post a team comment (chat message) on a thread. If the thread isn't yet shared, it is shared automatically. Supports text comments, file attachments, or both. Use `edit` to update an existing comment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | integer | yes (post) | Message ID of a message in the thread to comment on. Required when posting a new comment; omit when using `edit`. |
| `body` | string | when no `attach` | Comment text. Required when using `edit`. |
| `attach` | array of string | when no `body` | Absolute paths to files to attach. Each file is sent as a separate message. Cannot be combined with `edit`. |
| `edit` | integer | no | Message ID of an existing comment to edit. Requires `body`. |
| `team` | string | when >1 team | Team name. Required when the user belongs to multiple teams. |
| `user` | array of string | when team >2 members | Teammate emails to share with. Only used when auto-sharing an unshared thread. For teams with 2 or fewer members, the whole team is shared with automatically. |

```
comment { "message_id": 1234, "body": "Looks good, let's proceed." }
comment { "message_id": 1234, "body": "Please review this", "team": "Engineering" }
comment { "message_id": 1234, "body": "FYI", "team": "Engineering", "user": ["alice@co.com", "bob@co.com"] }
comment { "message_id": 1234, "attach": ["/path/to/screenshot.png"] }
comment { "message_id": 1234, "body": "See attached", "attach": ["/path/to/report.pdf", "/path/to/data.csv"] }
comment { "edit": 5678, "body": "Updated comment text" }
```

Use `emails` to find message IDs. Use `thread` to see comment IDs already posted on a conversation. Use `team` to list teams and their members.

### action

**Requires triage access.**

Perform an action on one or more emails. Pass `action_name` plus a `message_ids` array; some actions need additional options (`date`, `folder`, `team`, `user`, `assignee`, `comment`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action_name` | string | yes | Action to perform (see list below). |
| `message_ids` | array of integer | yes | Message IDs to act on. |
| `date` | string | for `snooze`, `changeReminder`; optional for `assign` | `yyyy-MM-dd`, `dd/MM/yyyy`, or `yyyy-MM-ddTHH:mm`. |
| `folder` | string | for `moveToFolder`, `attachLabel`, `detachLabel` | Qualified folder/label (e.g. `user@example.com:Archive`). Run `folders` for valid identifiers. |
| `team` | string | when >1 team for team actions | Team name. |
| `user` | array of string | for `shareInTeam` when team >2 members | Teammate emails to share with. |
| `assignee` | string | for `assign` | Teammate email to assign the email to. |
| `comment` | string | optional for `assign` | Comment text included with the assignment. |

Supported `action_name` values:

| Action | Effect |
|--------|--------|
| `pin` | Pin the message to keep it at the top |
| `unpin` | Remove the pin |
| `mute` | Mute the thread (stop notifications) |
| `unmute` | Unmute a previously muted thread |
| `snooze` | Snooze until `date` |
| `unsnooze` | Remove snooze, return to inbox |
| `changeReminder` | Set a follow-up reminder for `date` if no reply |
| `clearReminder` | Remove the follow-up reminder |
| `setAside` | Set aside for later review |
| `archive` | Archive |
| `moveToInbox` | Move back to inbox |
| `moveToTrash` | Move to trash |
| `moveToFolder` | Move to `folder` |
| `attachLabel` | Attach Gmail/Spark Team label `folder` (keeps other labels) |
| `detachLabel` | Remove Gmail/Spark Team label `folder` |
| `markAsDone` | Mark as done |
| `markAsUndone` | Mark as not done |
| `markAsSeen` | Mark as read |
| `markAsUnseen` | Mark as unread |
| `markAsSpam` | Mark as spam |
| `markThreadAsPriority` | Mark thread as priority |
| `unmarkThreadAsPriority` | Remove priority |
| `unsubscribe` | Unsubscribe from sender/mailing list |
| `changeCategoryPersonal` | Reclassify as Personal |
| `changeCategoryNotification` | Reclassify as Notification |
| `changeCategoryNewsletters` | Reclassify as Newsletter |
| `shareInTeam` | Share thread with teammates (`team`, `user`) |
| `assign` | Assign to teammate (`assignee`, optional `date`, `comment`) |
| `delegationComplete` | Mark delegation as complete |
| `delegationReopen` | Reopen a completed delegation |

```
action { "action_name": "pin", "message_ids": [12345] }
action { "action_name": "archive", "message_ids": [100, 200, 300] }
action { "action_name": "markAsSeen", "message_ids": [100, 200] }
action { "action_name": "snooze", "message_ids": [12345], "date": "2026-04-10T09:00" }
action { "action_name": "snooze", "message_ids": [12345], "date": "2026-04-10" }
action { "action_name": "moveToFolder", "message_ids": [12345], "folder": "user@example.com:Archive" }
action { "action_name": "attachLabel", "message_ids": [12345], "folder": "user@gmail.com:MyLabel" }
action { "action_name": "detachLabel", "message_ids": [12345], "folder": "shared@company.com:SomeLabel" }
action { "action_name": "changeReminder", "message_ids": [12345], "date": "2026-04-15" }
action { "action_name": "shareInTeam", "message_ids": [1234], "team": "Engineering", "user": ["alice@co.com"] }
action { "action_name": "shareInTeam", "message_ids": [1234], "user": ["alice@co.com", "bob@co.com"] }
action { "action_name": "assign", "message_ids": [1234], "assignee": "bob@co.com" }
action { "action_name": "assign", "message_ids": [1234], "assignee": "bob@co.com", "date": "2026-04-15", "comment": "Please review" }
action { "action_name": "delegationComplete", "message_ids": [1234] }
action { "action_name": "delegationComplete", "message_ids": [100, 200, 300] }
action { "action_name": "delegationReopen", "message_ids": [1234] }
```

Use `emails` to find message IDs. Use `folders` to resolve qualified names for `moveToFolder`, `attachLabel`, and `detachLabel`. Use `team` to list teams and members for team actions.

### contact-action

**Requires triage access.**

Perform an action on one or more contacts by email address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action_name` | string | yes | Action to perform (see list below). |
| `emails` | array of string | yes | Contact email addresses to act on. |

Supported `action_name` values:

| Action | Effect |
|--------|--------|
| `changeCategoryPersonal` | Reclassify the contact as Personal |
| `changeCategoryNotification` | Reclassify the contact as Notification |
| `changeCategoryNewsletters` | Reclassify the contact as Newsletter |
| `groupEmailsFromContact` | Group emails from the contact by category |
| `groupEmailsFromContactAndShowInInbox` | Group emails from the contact and show in inbox |
| `ungroupEmailsFromContact` | Ungroup emails from the contact |
| `markContactAsImportant` | Enable notifications for the contact |
| `unmarkContactAsImportant` | Disable notifications for the contact |
| `markContactAsPrimary` | Mark contact as priority (auto-prioritize) |
| `unmarkContactAsPrimary` | Remove priority mark |
| `acceptContact` | Accept or unblock the contact (bypass GateKeeper) |
| `blockContact` | Block the contact |
| `acceptDomain` | Accept or unblock the contact's entire domain |
| `blockDomain` | Block the contact's entire domain |
| `enableAutosummaryForContact` | Enable AI auto-summary for emails from the contact |
| `disableAutosummaryForContact` | Disable AI auto-summary for emails from the contact |

```
contact-action { "action_name": "blockContact", "emails": ["spammer@example.com"] }
contact-action { "action_name": "acceptContact", "emails": ["alice@co.com", "bob@co.com"] }
contact-action { "action_name": "changeCategoryPersonal", "emails": ["alice@co.com"] }
contact-action { "action_name": "markContactAsPrimary", "emails": ["ceo@company.com"] }
contact-action { "action_name": "enableAutosummaryForContact", "emails": ["newsletter@example.com"] }
```

Use `contacts` to look up email addresses.

## Smart Categories

Spark automatically classifies incoming email into six categories. Use the `category:` filter operator with `emails` and `search` to view mail by category, and use `action` / `contact-action` to reclassify and tune (triage).

| Category | Filter | Typical Content |
|----------|--------|-----------------|
| Priority | `category:priority` | Auto-prioritized or manually marked as priority |
| People | `category:personal` | Direct person-to-person email |
| Notifications | `category:notification` | Service notifications, alerts, receipts |
| Newsletters | `category:newsletter` | Subscriptions, digests, marketing |
| Invites | `category:invitation` | Calendar invitations |
| Invite Responses | `category:invitation_response` | RSVPs, accepts, declines |

Browse by category (read-only):

```
emails { "folder": "Inbox", "filter": "category:priority is:unread" }
emails { "folder": "Inbox", "filter": "category:personal is:unread" }
emails { "folder": "Inbox", "filter": "category:invitation" }
emails { "folder": "Inbox", "filter": "category:notification is:unread" }
emails { "folder": "Inbox", "filter": "category:newsletter newer_than:7d" }
```

Reclassify a single message (triage):

```
action { "action_name": "changeCategoryPersonal", "message_ids": [12345] }
action { "action_name": "changeCategoryNotification", "message_ids": [12345] }
action { "action_name": "changeCategoryNewsletters", "message_ids": [12345] }
```

Tune per-contact category rules (triage) - changes apply to all future mail from the sender:

```
contact-action { "action_name": "changeCategoryPersonal", "emails": ["sender@example.com"] }
contact-action { "action_name": "changeCategoryNewsletters", "emails": ["sender@example.com"] }
contact-action { "action_name": "groupEmailsFromContact", "emails": ["sender@example.com"] }
contact-action { "action_name": "markContactAsImportant", "emails": ["vip@example.com"] }
contact-action { "action_name": "markContactAsPrimary", "emails": ["ceo@example.com"] }
contact-action { "action_name": "enableAutosummaryForContact", "emails": ["newsletter@example.com"] }
```

**Category-first triage pattern:** Process inbox in priority order - priority -> people -> invites -> notifications -> newsletters. This ensures the most important messages get attention first.

## Typical Workflows

**Answer a question about emails:**
1. `search { "query": "topic" }` - find relevant emails with bodies.
2. Read the output and answer the user's question.

**Find and read a specific email:**
1. `emails { "filter": "from:sender subject:keyword" }` - locate the email.
2. `thread { "message_id": "<ID>" }` - read the full conversation.

**Draft a reply:**
1. `emails { "filter": "from:sender" }` - find the email.
2. `draft { "reply_to": <ID>, "body": "Thanks for the update!" }`.

**Check someone's schedule for a meeting:**
1. `availability { "tomorrow": true, "attendees": "alice@co.com,bob@co.com" }`.
2. Suggest a time from the free slots.

**Comment on a shared thread:**
1. `emails { "filter": "subject:keyword" }` - find the email.
2. `comment { "message_id": <ID>, "body": "Looks good, approved!" }`.

**Get team workload overview:**
1. `team { "name": "Team Name" }` - see members and assigned emails.

**Look up a contact:**
1. `contacts { "query": "name or domain" }` - find their email address.

**Triage a thread (archive/pin/snooze):**
1. `emails { "filter": "from:sender" }` - find the message.
2. `action { "action_name": "archive", "message_ids": [<ID>] }` - archive (or `pin`, `snooze` with `date`, etc.).

**Bulk archive after review:**
1. `emails { "folder": "Inbox", "filter": "category:newsletter newer_than:7d" }` - list candidates.
2. `action { "action_name": "archive", "message_ids": [<ID1>, <ID2>, <ID3>] }` - archive in one call.

**Share an email with the team:**
1. `emails { "filter": "subject:keyword" }` - find the email.
2. `action { "action_name": "shareInTeam", "message_ids": [<ID>], "user": ["alice@co.com"] }`.

**Delegate an email to a teammate:**
1. `emails { "filter": "subject:keyword" }` - find the email.
2. `action { "action_name": "assign", "message_ids": [<ID>], "assignee": "bob@co.com", "date": "2026-04-15", "comment": "Please handle this" }`.

**Mark delegated emails as done:**
1. `emails { "filter": "subject:keyword" }` - find the email(s).
2. `action { "action_name": "delegationComplete", "message_ids": [<ID1>, <ID2>] }`.

**Review assigned shared inbox items:**
1. `emails { "folder": "shared@co.com:Inbox", "filter": "assigned_to:unassigned" }` - unassigned items.
2. `action { "action_name": "assign", "message_ids": [<ID>], "assignee": "bob@co.com" }` - assign to a teammate.
3. `emails { "filter": "assigned_to:bob@co.com" }` - items assigned to a teammate.
4. `emails { "filter": "is:shared_inbox_open" }` - all open shared inbox items.
5. `emails { "filter": "is:shared_inbox_done" }` - completed items.

**Read meeting notes:**
1. `meetings { "filter": "newer_than:30d" }` - find recent meetings.
2. `meeting { "meeting_id": "<ID>", "transcript": true, "notes": true }` - read summary, transcript, and notes.

**Manage a contact (block/accept/categorize):**
1. `contacts { "query": "name or domain" }` - find the contact email.
2. `contact-action { "action_name": "blockContact", "emails": ["spammer@example.com"] }` - block (or `acceptContact`, change category, etc.).

## Tips

- Combine filter operators into a single `filter` string: `"from:alice@co.com is:unread newer_than:7d"` - do not split them across calls.
- Call `folders` to discover exact folder identifiers before passing them to `emails` or `search`'s `in` parameter.
- Call `accounts` to discover calendar identifiers before passing them to `events`'s `in` parameter, **and** to check each account's access level before attempting `draft`, `comment`, `action`, or `contact-action`.
- Use `search` for topic-based queries - it returns bodies. Use `emails` for browsing or slicing by metadata - it does not.
- Use `thread` after finding an interesting message ID with `emails` or `search`.
- Multi-word subjects and team names must be quoted inside the filter string: `subject:"quarterly report"`.
- `action` and `contact-action` accept arrays of IDs/emails - batch related changes into a single call rather than one call per message.
- If a write tool returns an "access denied" error, surface it to the user and point them at **Spark Desktop > Settings > AI Agents** to raise the level. They can also perform the action directly in Spark Desktop.
