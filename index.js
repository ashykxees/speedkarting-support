const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const categories = require('./categories');
const { color, roleIdsFor, isStaff, makeTopic, parseTopic, buildTranscript } = require('./util');

const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'TICKET_CATEGORY_ID', 'LOG_CHANNEL_ID'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const WAIT_NOTE = '⏳ Longer wait time is expected due to limited support members.';
const EPHEMERAL = MessageFlags.Ephemeral;

// Session hosting (override with Railway variables if the channels ever change)
const SESSION_CHANNEL_ID = process.env.SESSION_CHANNEL_ID || '1523525528504631436';
const PROMO_CHANNEL_ID = process.env.PROMO_CHANNEL_ID || '1557207136252203058';
const SESSION_PING_ROLE_ID = process.env.SESSION_PING_ROLE_ID || '1557211000493703199';
const PROMO_PING_ROLE_ID = process.env.PROMO_PING_ROLE_ID || '1557210868574453831';
const GAME_URL = 'https://www.roblox.com/games/6086015016/SpeedKarting';

const client = new Client({
  // MessageContent is a privileged intent: enable it in the Developer Portal
  // (Bot tab) or transcripts will come out empty.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const byId = (id) => categories.find((c) => c.id === id);

// ---------- Slash commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the support ticket panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('session')
    .setDescription('SpeedKarting session tools')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('host')
        .setDescription('Announce a shift you are hosting')
        .addStringOption((o) => o.setName('date').setDescription('Date of the shift (e.g. October 10)').setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName('time').setDescription('Time of the shift (e.g. 5:00 PM EST)').setRequired(true).setMaxLength(100))
        .addStringOption((o) =>
          o
            .setName('shift_type')
            .setDescription('Type of shift')
            .setRequired(true)
            .addChoices({ name: 'Promotional', value: 'promotional' }, { name: 'Prize', value: 'prize' }),
        ),
    ),
].map((c) => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log(`Logged in as ${c.user.tag} — slash commands registered.`);
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// ---------- Panel ----------
function panelPayload(guild) {
  const divider = '─'.repeat(26);
  const sections = categories.map(
    (c) => `${c.emoji} **${c.label}**\n> ${c.blurb}`,
  );

  const description = [
    'Please select the ticket option below that best matches your inquiry so it is directed to the correct **department**. To keep things efficient, please do **not** ping or directly message staff members within your ticket.',
    '',
    divider,
    '',
    sections.join(`\n\n${divider}\n\n`),
    '',
    divider,
    '',
    `⏳ *${WAIT_NOTE.replace('⏳ ', '')}*`,
  ].join('\n');

  const icon = guild?.iconURL({ size: 128 }) || undefined;
  const embed = new EmbedBuilder()
    .setColor(color())
    .setAuthor({ name: 'SpeedKarting Support', iconURL: icon })
    .setTitle('🏁 How can we help?')
    .setDescription(description)
    .setFooter({ text: 'SpeedKarting • Support Team', iconURL: icon });

  if (icon) embed.setThumbnail(icon);
  if (process.env.PANEL_IMAGE_URL) embed.setImage(process.env.PANEL_IMAGE_URL);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:category')
    .setPlaceholder('🏁 Select a support department…')
    .addOptions(
      categories.map((c) =>
        new StringSelectMenuOptionBuilder().setLabel(c.label).setDescription(c.description.slice(0, 100)).setValue(c.id).setEmoji(c.emoji),
      ),
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === 'panel') return await handlePanel(i);
    if (i.isChatInputCommand() && i.commandName === 'session') return await handleSession(i);
    if (i.isStringSelectMenu() && i.customId === 'ticket:category') return await handleCategory(i);
    if (i.isStringSelectMenu() && i.customId.startsWith('ticket:topic:')) return await handleTopic(i);
    if (i.isModalSubmit() && i.customId.startsWith('ticket:modal:')) return await handleModal(i);
    if (i.isButton() && i.customId === 'ticket:claim') return await handleClaim(i);
    if (i.isButton() && i.customId === 'ticket:close') return await handleCloseAsk(i);
    if (i.isButton() && i.customId === 'ticket:close:confirm') return await handleCloseConfirm(i);
    if (i.isButton() && i.customId === 'ticket:close:cancel') return await i.update({ content: 'Close cancelled.', components: [] });
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ Something went wrong. Please try again or contact a staff member.', flags: EPHEMERAL };
    if (i.deferred || i.replied) await i.followUp(msg).catch(() => {});
    else await i.reply(msg).catch(() => {});
  }
});

// ---------- /session host ----------
async function handleSession(i) {
  if (i.options.getSubcommand() !== 'host') return;

  // Optional: limit who can host (comma-separated role IDs). Admins always allowed.
  const hostRoles = (process.env.SESSION_HOST_ROLE_ID || '').split(',').map((r) => r.trim()).filter(Boolean);
  if (hostRoles.length && !i.member.permissions.has(PermissionFlagsBits.Administrator) && !hostRoles.some((id) => i.member.roles.cache.has(id))) {
    return i.reply({ content: '❌ You are not allowed to host sessions.', flags: EPHEMERAL });
  }

  await i.deferReply({ flags: EPHEMERAL });

  const date = i.options.getString('date', true);
  const time = i.options.getString('time', true);
  const type = i.options.getString('shift_type', true);
  const typeLabel = type === 'promotional' ? 'Promotional' : 'Prize';

  const sessionChannel = await client.channels.fetch(SESSION_CHANNEL_ID).catch(() => null);
  if (!sessionChannel) return i.editReply('❌ I cannot access the session channel. Check my permissions there.');

  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Join Game').setEmoji('🏁').setStyle(ButtonStyle.Link).setURL(GAME_URL),
  );

  const sessionDescription =
    type === 'promotional'
      ? 'A **promotional shift** is being hosted! Join us in-game at the time below.'
      : 'A **prize shift** is being hosted! Join us in-game at the time below for a chance to win prizes.';

  const sessionEmbed = new EmbedBuilder()
    .setColor(color())
    .setAuthor({ name: 'SpeedKarting Sessions', iconURL: i.guild.iconURL({ size: 128 }) || undefined })
    .setTitle(type === 'promotional' ? '⭐ Promotional Shift Being Hosted' : '🏆 Prize Shift Being Hosted')
    .setDescription(sessionDescription)
    .addFields(
      { name: 'Date', value: date, inline: true },
      { name: 'Time', value: time, inline: true },
      { name: 'Shift Type', value: typeLabel, inline: true },
      { name: 'Host', value: `${i.user} (${i.user.username})` },
    )
    .setFooter({ text: 'SpeedKarting • Sessions' })
    .setTimestamp();

  const sent = await sessionChannel.send({
    content: `<@&${SESSION_PING_ROLE_ID}>`,
    embeds: [sessionEmbed],
    components: [joinRow],
    allowedMentions: { roles: [SESSION_PING_ROLE_ID] },
  });
  let note = '';

  if (type === 'promotional') {
    try {
      const promoChannel = await client.channels.fetch(PROMO_CHANNEL_ID);
      const promoEmbed = new EmbedBuilder()
        .setColor(color())
        .setAuthor({ name: 'SpeedKarting Sessions', iconURL: i.guild.iconURL({ size: 128 }) || undefined })
        .setTitle('⭐ Promotional Shift Being Hosted')
        .setDescription(
          `A **promotional shift** is being hosted! Check <#${SESSION_CHANNEL_ID}> for the full session details and join us in-game at the time below.`,
        )
        .addFields(
          { name: 'Date', value: date, inline: true },
          { name: 'Time', value: time, inline: true },
          { name: 'Host', value: `${i.user} (${i.user.username})` },
        )
        .setFooter({ text: 'SpeedKarting • Sessions' })
        .setTimestamp();
      await promoChannel.send({
        content: `<@&${PROMO_PING_ROLE_ID}>`,
        embeds: [promoEmbed],
        components: [joinRow],
        allowedMentions: { roles: [PROMO_PING_ROLE_ID] },
      });
    } catch (err) {
      console.error('Failed to send promotional announcement:', err);
      note = '\n⚠️ The session was posted, but I could not post the promotional announcement. Check my permissions in that channel.';
    }
  }

  await i.editReply(`✅ Your shift has been announced: ${sent.url}${note}`);
}

async function handlePanel(i) {
  await i.channel.send(panelPayload(i.guild));
  await i.reply({ content: '✅ Panel posted.', flags: EPHEMERAL });
}

async function handleCategory(i) {
  const category = byId(i.values[0]);
  if (!category) return;

  // One open ticket per person
  const existing = await findOpenTicket(i.guild, i.user.id);
  if (existing) {
    await i.reply({ content: `❌ You already have an open ticket: ${existing}`, flags: EPHEMERAL });
  } else if (category.topics.length === 1) {
    // Only one topic: skip the second dropdown and go straight to the form
    await i.showModal(buildModal(category, category.topics[0]));
  } else {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket:topic:${category.id}`)
      .setPlaceholder('Choose a topic…')
      .addOptions(category.topics.map((t) => new StringSelectMenuOptionBuilder().setLabel(t.label.slice(0, 100)).setValue(t.id)));
    await i.reply({
      content: `**${category.emoji} ${category.label}** — what do you need help with?`,
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: EPHEMERAL,
    });
  }

  // Reset the panel dropdown so the same category can be picked again
  i.message.edit({ components: i.message.components }).catch(() => {});
}

async function handleTopic(i) {
  const category = byId(i.customId.split(':')[2]);
  const topic = category?.topics.find((t) => t.id === i.values[0]);
  if (!topic) return;
  await i.showModal(buildModal(category, topic));
}

function buildModal(category, topic) {
  const modal = new ModalBuilder().setCustomId(`ticket:modal:${category.id}:${topic.id}`).setTitle(category.label.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('roblox')
        .setLabel('Roblox username')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(40)
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('details')
        .setLabel('Describe your request')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true),
    ),
  );
  return modal;
}

async function findOpenTicket(guild, userId) {
  const channels = await guild.channels.fetch();
  return channels.find((ch) => ch && ch.parentId === process.env.TICKET_CATEGORY_ID && parseTopic(ch.topic)?.ownerId === userId) || null;
}

async function handleModal(i) {
  await i.deferReply({ flags: EPHEMERAL });
  const [, , catId, topicId] = i.customId.split(':');
  const category = byId(catId);
  const topic = category?.topics.find((t) => t.id === topicId);
  if (!category || !topic) return i.editReply('❌ Invalid category.');

  const existing = await findOpenTicket(i.guild, i.user.id);
  if (existing) return i.editReply(`❌ You already have an open ticket: ${existing}`);

  const roblox = i.fields.getTextInputValue('roblox');
  const details = i.fields.getTextInputValue('details');
  const roleIds = roleIdsFor(category);

  const overwrites = [
    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: i.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
    },
    {
      id: client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks],
    },
    ...roleIds.map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
    })),
  ];

  const name = `${category.id}-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 90);
  const channel = await i.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: process.env.TICKET_CATEGORY_ID,
    topic: makeTopic(i.user.id, category.id, topic.label),
    permissionOverwrites: overwrites,
  });

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.label}`)
    .setColor(color())
    .setDescription(`Thanks for reaching out, ${i.user}! A member of our team will be with you shortly.\n\n*${WAIT_NOTE}*`)
    .addFields(
      { name: 'Topic', value: topic.label },
      { name: 'Roblox username', value: roblox, inline: true },
      { name: 'Opened by', value: `${i.user}`, inline: true },
      { name: 'Details', value: details },
    )
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );

  const ping = roleIds.map((id) => `<@&${id}>`).join(' ');
  await channel.send({
    content: `${i.user}${ping ? ` ${ping}` : ''}`,
    embeds: [embed],
    components: [buttons],
    allowedMentions: { users: [i.user.id], roles: roleIds },
  });

  await i.editReply(`✅ Your ticket has been created: ${channel}`);
  await logTo(`📩 Ticket opened: ${channel} by ${i.user} — **${category.label}** / ${topic.label}`);
}

async function handleClaim(i) {
  const info = parseTopic(i.channel.topic);
  const category = info && byId(info.categoryId);
  if (!category) return;
  if (!isStaff(i.member, category)) return i.reply({ content: '❌ Only staff can claim tickets.', flags: EPHEMERAL });

  const row = ActionRowBuilder.from(i.message.components[0]);
  row.components[0].setDisabled(true).setLabel(`Claimed by ${i.user.username}`.slice(0, 80));
  await i.update({ components: [row] });
  await i.channel.send(`🙋 ${i.user} has claimed this ticket.`);
}

async function handleCloseAsk(i) {
  const info = parseTopic(i.channel.topic);
  const category = info && byId(info.categoryId);
  if (!category) return;
  if (!isStaff(i.member, category) && i.user.id !== info.ownerId) {
    return i.reply({ content: '❌ You cannot close this ticket.', flags: EPHEMERAL });
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close:confirm').setLabel('Yes, close it').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:close:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  await i.reply({ content: 'Are you sure you want to close this ticket?', components: [row], flags: EPHEMERAL });
}

async function handleCloseConfirm(i) {
  const info = parseTopic(i.channel.topic);
  const category = info && byId(info.categoryId);
  if (!category) return;
  if (!isStaff(i.member, category) && i.user.id !== info.ownerId) {
    return i.reply({ content: '❌ You cannot close this ticket.', flags: EPHEMERAL });
  }

  await i.update({ content: '🔒 Closing ticket and saving transcript…', components: [] });
  const channel = i.channel;
  const transcript = await buildTranscript(channel);
  const file = new AttachmentBuilder(transcript, { name: `${channel.name}-transcript.txt` });

  const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setTitle('Ticket closed')
      .setColor(0xed4245)
      .addFields(
        { name: 'Ticket', value: channel.name, inline: true },
        { name: 'Category', value: `${category.label}\n${info.topicLabel}`, inline: true },
        { name: 'Opened by', value: `<@${info.ownerId}>`, inline: true },
        { name: 'Closed by', value: `${i.user}`, inline: true },
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed], files: [file] });
  }

  // Best-effort DM of the transcript to the ticket owner
  try {
    const owner = await client.users.fetch(info.ownerId);
    await owner.send({
      content: `Your SpeedKarting support ticket (**${category.label}**) was closed. Here is a transcript.`,
      files: [new AttachmentBuilder(transcript, { name: `${channel.name}-transcript.txt` })],
    });
  } catch {}

  await channel.send('This ticket will be deleted in 5 seconds.');
  setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 5000);
}

async function logTo(text) {
  const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null);
  if (ch) ch.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
}

client.login(process.env.DISCORD_TOKEN);
