/**
 * readDontWrite.js
 *
 * Enforces a read-only channel: if anyone (non-bot) sends a message in the
 * channel set by DONT_TALK_CHANNEL, their message is deleted, they're DM'd
 * an explanation with a one-time invite link, and then they're kicked.
 *
 * Requires discord.js v14.
 *
 * Setup:
 *   1. Put this file alongside your other bot files (e.g. ./readDontWrite.js).
 *   2. In your main bot file, after you create your `client`:
 *
 *        const { registerReadDontWrite } = require('./readDontWrite');
 *        registerReadDontWrite(client);
 *
 *   3. In Railway, set an env var:
 *        DONT_TALK_CHANNEL = <the channel's ID>
 *
 * Bot permissions needed (in that channel, and server-wide for kick):
 *   - Kick Members
 *   - Manage Messages   (to delete the offending message)
 *   - Create Instant Invite
 */

function registerReadDontWrite(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!process.env.DONT_TALK_CHANNEL) return;
    if (message.channelId !== process.env.DONT_TALK_CHANNEL) return;

    try {
      // Remove the offending message
      await message.delete().catch(() => {});

      // Generate a single-use invite so they can rejoin
      const invite = await message.channel.createInvite({
        maxUses: 1,
        maxAge: 0, // never expires — set e.g. 86400 for a 24h link instead
        unique: true,
      });

      // DM before kicking — DMs can fail once they're no longer a member on some setups
      await message.author.send(
        `You were removed from **${message.guild.name}** for sending a message in <#${message.channelId}>, which is read-only. ` +
        `You're welcome to rejoin: ${invite.url}`
      ).catch(() => {
        // DMs disabled — nothing more we can do, proceed with the kick anyway
      });

      await message.member.kick(`Spoke in read-only channel: ${message.channel.name}`);
    } catch (err) {
      console.error('Failed to enforce read-only channel:', err);
    }
  });
}

module.exports = { registerReadDontWrite };
