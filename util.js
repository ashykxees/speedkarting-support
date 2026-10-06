const { PermissionFlagsBits } = require('discord.js');

const color = () => parseInt((process.env.EMBED_COLOR || '5865F2').replace('#', ''), 16) || 0x5865f2;

// Returns the staff role IDs for a category (supports comma-separated IDs).
function roleIdsFor(category) {
  const raw = process.env[category.roleEnv] || process.env.SUPPORT_ROLE_ID || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function isStaff(member, category) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return roleIdsFor(category).some((id) => member.roles.cache.has(id));
}

// Ticket info is stored in the channel topic so nothing is lost when Railway
// redeploys: ticket|<ownerId>|<categoryId>|<topicLabel>
const makeTopic = (ownerId, categoryId, topicLabel) => `ticket|${ownerId}|${categoryId}|${topicLabel}`.slice(0, 1000);

function parseTopic(topic) {
  if (!topic || !topic.startsWith('ticket|')) return null;
  const [, ownerId, categoryId, ...rest] = topic.split('|');
  return { ownerId, categoryId, topicLabel: rest.join('|') };
}

async function buildTranscript(channel) {
  let all = [];
  let before;
  for (let i = 0; i < 20; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all = all.concat([...batch.values()]);
    before = batch.last().id;
  }
  all.reverse();
  const lines = all.map((m) => {
    const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    const embedText = m.embeds.length ? ` [embed: ${m.embeds.map((e) => e.title || e.description || '').join(' / ').slice(0, 200)}]` : '';
    const files = m.attachments.size ? ` [attachments: ${m.attachments.map((a) => a.url).join(', ')}]` : '';
    return `[${time}] ${m.author.tag}: ${m.content}${embedText}${files}`;
  });
  return Buffer.from(lines.join('\n') || '(no messages)', 'utf8');
}

module.exports = { color, roleIdsFor, isStaff, makeTopic, parseTopic, buildTranscript };
