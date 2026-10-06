// Edit this file to change the dropdown options. Each category has its own
// staff-role env variable, so tickets only ping/allow the right team.
module.exports = [
  {
    id: 'staffing',
    label: 'Staffing Support',
    emoji: '🛡️',
    description: 'Rank/role issues and applications',
    roleEnv: 'STAFFING_ROLE_ID',
    topics: [
      { id: 'rank_role', label: 'Rank/Role issue' },
      { id: 'applications', label: 'Applications' },
    ],
  },
  {
    id: 'relations',
    label: 'Relations Support',
    emoji: '🤝',
    description: 'Partnerships and affiliate requirements',
    roleEnv: 'RELATIONS_ROLE_ID',
    topics: [
      { id: 'partnership', label: 'Submit a partnership request' },
      { id: 'affiliate', label: 'Learn more about our affiliate requirements' },
    ],
  },
  {
    id: 'technical',
    label: 'Technical Support',
    emoji: '🛠️',
    description: 'Report an in-game bug',
    roleEnv: 'TECHNICAL_ROLE_ID',
    topics: [{ id: 'bug', label: 'Report an in-game bug' }],
  },
  {
    id: 'general',
    label: 'General Support',
    emoji: '💬',
    description: "Ask anything that doesn't fit in any other category",
    roleEnv: 'GENERAL_ROLE_ID',
    topics: [{ id: 'general', label: "Ask anything that doesn't fit in any other category" }],
  },
  {
    id: 'executive',
    label: 'Executive Support',
    emoji: '⚖️',
    description: 'Report a staff member or report abuse',
    roleEnv: 'EXECUTIVE_ROLE_ID',
    topics: [
      { id: 'report_staff', label: 'Report a staff member' },
      { id: 'report_abuse', label: 'Report abuse' },
    ],
  },
];
