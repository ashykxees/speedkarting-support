# SpeedKarting Support Bot

Tickety-style ticket bot: a panel embed with a dropdown → pick a category (and topic) → fill in a short form → a private ticket channel is created for the right staff team.

## Categories
Staffing, Relations, Technical, General, Executive (edit `src/categories.js` to change them).

## Discord Developer Portal setup
1. Create an application → **Bot** tab → copy the token (`DISCORD_TOKEN`).
2. Under **Privileged Gateway Intents**, enable **Message Content Intent** (needed for transcripts).
3. Invite the bot with the `bot` + `applications.commands` scopes and the permissions: Manage Channels, View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Roles is **not** needed.
4. Make sure the bot's role is allowed to see the ticket category and the log channel.

## Environment variables
See `.env.example`. Required: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `TICKET_CATEGORY_ID`, `LOG_CHANNEL_ID`, plus a role ID for each support team (or just `SUPPORT_ROLE_ID` as a fallback for all).

Enable Developer Mode in Discord (Settings → Advanced) to right-click and **Copy ID**.

## Deploy on Railway
1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub repo.
3. Add the variables in the **Variables** tab.
4. Deploy. On startup the bot registers `/panel` automatically.
5. In your support channel run `/panel` (Administrator only).

## Local run
```
npm install
cp .env.example .env   # fill it in, then export the vars or use: node --env-file=.env src/index.js
npm start
```

Ticket data is stored in each channel's topic, so redeploys don't lose open tickets.
