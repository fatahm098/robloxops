# Testing the Discord bot locally

## 1. Token

Edit `apps/worker/.env` (gitignored) and set:

```
DISCORD_BOT_TOKEN=your-bot-token
```

Never commit or paste the token anywhere else.

## 2. Validate the token (no DB needed)

From `apps/worker`:

```bash
.venv/Scripts/python scripts/check_token.py
```

It prints the bot name/id and an invite URL. If it says invalid, regenerate the
token in the Discord Developer Portal.

## 3. Discord Developer Portal

- **Bot → Privileged Gateway Intents**: enable **Message Content Intent**
  (required to read commission messages).
- **OAuth2 → URL Generator** (or use the URL from step 2): scopes
  `bot` + `applications.commands`; permissions include View Channels, Send
  Messages, Read History, Create/Manage Threads, Send Messages in Threads.
- Invite the bot to your **test server**.

## 4. Local database (Docker)

The bot needs Postgres. Start Docker Desktop, then:

```bash
docker run -d --name robloxops-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robloxops \
  -p 5432:5432 postgres:16-alpine
```

Apply the schema the bot uses + seed demo data:

```bash
cd apps/worker
.venv/Scripts/python scripts/init_local_db.py --guild-id <SERVER_ID> --channels <CHANNEL_ID[,CHANNEL_ID]>
```

- `SERVER_ID`: right-click your server → Copy Server ID (enable Developer Mode).
- `CHANNEL_ID`: the intake channel the bot should watch. Commands work without it;
  message intake needs it.

Re-running the script updates the guild/channel ids safely.

## 5. Run the bot

```bash
cd apps/worker
.venv/Scripts/python bot.py
```

On ready it logs the bot name and every guild id it can see.

## 6. Test

- `/help` — should reply with the command list.
- `/status` — shows the seeded `ROB-105` project.
- `/brief` — shows the seeded brief.
- `/revision reason:"glow too bright"` — logs a revision and flips the project to `revision`.
- Post a message in the monitored channel → the bot enqueues an intake job and tries
  the FastAPI worker for an immediate reply.

## 7. Private messages (DM)

Customers can also DM the bot directly. A DM has no guild, so the bot resolves
the tenant from the servers the author shares with it:

- exactly **one** tenant server → the DM is handled as that studio's
  conversation. The DM channel id is stored as the project's
  `discord_thread_id`, so later replies continue the same project and outbound
  delivery still works.
- **zero or several** tenant servers → the bot replies with a short fallback
  asking the user to post in a monitored channel (no worker call, no data
  written).

Requirements and limits:

- Enable **Message Content Intent** (same as channels); the bot also turns on
  the DM intent (`intents.dm_messages`).
- The bot cannot start a DM: the customer must message first. Bots cannot be in
  group DMs.
- In production the bot is shared by all tenants, so one Discord user in two
  studios is intentionally ambiguous — use channels for those customers.

## Notes

- Slash commands only need the DB. The FastAPI worker (`uvicorn app.main:app`) is
  needed for automatic AI replies and thread creation on new commissions.
- The web dashboard can keep running in demo mode; it does not need this DB.
- This local DB is a **test shim** (`supabase/local/bootstrap.sql`) — production uses
  real Supabase, which provides auth/storage/vault natively.
