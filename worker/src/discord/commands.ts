/**
 * The bot's slash commands, as they are registered with Discord
 * (POST /discord/commands from the admin panel). Names and options here are
 * what interactions.ts reads back.
 */

const STRING = 3;
const INTEGER = 4;
const USER = 6;
const SUB_COMMAND = 1;

// Hidden from everyone but server administrators until they share it in
// Server Settings, Integrations; the handler checks again either way.
const ADMINISTRATOR = String(1 << 3);

const who = (verb: string) => [
  { type: USER, name: "user", description: `A server member to ${verb}, if they allow it`, required: false },
  { type: STRING, name: "name", description: "A Cascade username", required: false, max_length: 64 },
];

export const LEADERBOARDS = [
  { name: "Mapping time", value: "mapping_time" },
  { name: "Notes placed", value: "notes_placed" },
  { name: "Maps edited", value: "maps_edited" },
  { name: "Contribution points", value: "contribution_points" },
] as const;

export type LeaderboardMetric = (typeof LEADERBOARDS)[number]["value"];

const ROADMAP_STATUSES = [
  { name: "Planned", value: "planned" },
  { name: "In progress", value: "in_progress" },
  { name: "Done", value: "done" },
];

export const COMMANDS = [
  { name: "profile", description: "Show a Cascade profile", options: who("look up") },
  { name: "stats", description: "Show Cascade mapping statistics", options: who("look up") },
  { name: "link", description: "Connect your Discord account to your Cascade account" },
  {
    name: "leaderboard",
    description: "Rankings of Cascade users who chose to appear on them",
    options: [
      { type: STRING, name: "board", description: "What to rank by", required: false, choices: LEADERBOARDS },
    ],
  },
  { name: "bug", description: "Report a bug in Cascade" },
  { name: "suggest", description: "Suggest a feature for Cascade" },
  {
    name: "contributions",
    description: "Accepted contributions and contributor points",
    options: [who("look up")[0]],
  },
  { name: "roadmap", description: "What is planned for Cascade" },
  { name: "changelog", description: "Recent Cascade releases" },
  { name: "help", description: "What the Cascade bot can do" },
  {
    name: "cascade-admin",
    description: "Cascade maintainer tools",
    default_member_permissions: ADMINISTRATOR,
    contexts: [0],
    options: [
      { type: SUB_COMMAND, name: "pending", description: "Contributions waiting for review" },
      {
        type: SUB_COMMAND,
        name: "review",
        description: "Accept or reject a contribution",
        options: [
          { type: INTEGER, name: "number", description: "The contribution's number", required: true, min_value: 1 },
          {
            type: STRING,
            name: "decision",
            description: "Accept or reject",
            required: true,
            choices: [
              { name: "Accept", value: "accept" },
              { name: "Reject", value: "reject" },
            ],
          },
          { type: INTEGER, name: "points", description: "Points instead of the default", required: false, min_value: 0, max_value: 1000 },
          { type: STRING, name: "note", description: "A short note kept with the review", required: false, max_length: 300 },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "award",
        description: "Record a contribution made outside the bot",
        options: [
          { type: USER, name: "user", description: "Who contributed", required: true },
          { type: INTEGER, name: "points", description: "Points to award", required: true, min_value: 1, max_value: 1000 },
          { type: STRING, name: "reason", description: "What they did", required: true, min_length: 3, max_length: 120 },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "contributor",
        description: "Give or take the Contributor role regardless of points",
        options: [
          { type: USER, name: "user", description: "The member", required: true },
          {
            type: STRING,
            name: "mode",
            description: "Grant, deny, or follow the points again",
            required: true,
            choices: [
              { name: "Grant", value: "grant" },
              { name: "Deny", value: "deny" },
              { name: "Follow points", value: "auto" },
            ],
          },
          { type: STRING, name: "note", description: "Why", required: false, max_length: 200 },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "points",
        description: "Show or change point values and the Contributor threshold",
        options: [
          { type: INTEGER, name: "bug", description: "Points for an accepted bug report", required: false, min_value: 0, max_value: 1000 },
          { type: INTEGER, name: "suggestion", description: "Points for an accepted suggestion", required: false, min_value: 0, max_value: 1000 },
          { type: INTEGER, name: "threshold", description: "Points needed for the Contributor role", required: false, min_value: 1, max_value: 100000 },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "roadmap-add",
        description: "Add an item to the roadmap",
        options: [
          { type: STRING, name: "title", description: "What it is", required: true, min_length: 1, max_length: 100 },
          { type: STRING, name: "status", description: "Where it stands", required: false, choices: ROADMAP_STATUSES },
          { type: STRING, name: "details", description: "One or two sentences", required: false, max_length: 300 },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "roadmap-status",
        description: "Move a roadmap item",
        options: [
          { type: INTEGER, name: "item", description: "The item's number from /roadmap", required: true, min_value: 1 },
          { type: STRING, name: "status", description: "Where it stands now", required: true, choices: ROADMAP_STATUSES },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "roadmap-remove",
        description: "Take an item off the roadmap",
        options: [{ type: INTEGER, name: "item", description: "The item's number from /roadmap", required: true, min_value: 1 }],
      },
    ],
  },
];
