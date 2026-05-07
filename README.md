# Spark for Claude

Give Claude access to [Spark](https://sparkmailapp.com) - read, draft, triage, and act on your email, calendars, meetings, and contacts.

What Claude can do:

- Search and browse your emails across all connected accounts
- Read full threads with bodies and attachments
- List folders and shared inboxes
- Look up contacts
- Check calendar events and find free time slots for scheduling
- Review meeting transcripts, summaries, and notes
- Show team info, members, and assignments
- Compose drafts - new messages, replies, forwards, with attachments
- Post team chat comments on shared threads
- Triage messages - archive, pin, snooze, move, label, mark as done, share with team, assign and delegate
- Reclassify smart categories (Priority, People, Notifications, Newsletters)
- Manage contacts - block/accept, change category, mark important/primary, toggle auto-summary

## Requirements

- macOS with a recent build of [Spark Desktop](https://sparkmailapp.com), signed in to at least one account.
- Spark CLI enabled: in Spark, go to **Settings → AI Agents → Spark CLI Setup** and follow the prompts.
- For each account or shared inbox, choose the access level Claude should have: **Settings → AI Agents** (`read-only` or `triage`). Read-only allows browsing and reading; triage additionally allows drafts, comments, and email/contact actions. Shared inboxes can have a different level than their parent account.
- Claude Desktop.

## Install the extension (Claude Desktop)

1. Download [`Spark.mcpb`](https://github.com/readdle/spark-claude-extension/releases/latest/download/Spark.mcpb)
2. Open Claude Desktop and go to **Settings → Extensions**.
3. Click **Advanced settings**, then **Install…** and choose the downloaded `Spark.mcpb` file.

## Install the companion skill (optional)

The skill extends the extension for more complex use cases.

1. Download [`Spark.skill`](https://github.com/readdle/spark-claude-extension/releases/latest/download/Spark.skill)
2. Double-click the downloaded `Spark.skill` file to install it into Claude Desktop.

## License

[MIT](LICENSE) © Spark Mail Limited
