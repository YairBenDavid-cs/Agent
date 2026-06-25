/*
 * List all users with a quick "has this user onboarded?" flag.
 *
 * Run via the wrapper:   ./list-users.sh
 * Or directly:           mongosh "<MONGO_URL>" --file list-users.mongosh.js
 */

const dbx = db.getSiblingDB('coach_platform');

// user_ids that currently have an active training profile (= onboarded).
const onboarded = new Set(
  dbx.training_profiles.distinct('user_id', { status: 'active' }),
);

const users = dbx.users.find().sort({ updatedAt: -1 }).toArray();

print(`${users.length} user${users.length === 1 ? '' : 's'}\n`);
print(['onboarded', 'email', 'name', 'user_id'].join('\t'));
print('-'.repeat(72));

users.forEach((u) => {
  const flag = onboarded.has(u.user_id) ? 'yes' : 'no ';
  print([flag, u.email, u.name ?? '', u.user_id].join('\t'));
});
