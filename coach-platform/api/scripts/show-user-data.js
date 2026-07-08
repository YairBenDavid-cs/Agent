/* Dump every collection's data for a single user.
 * Usage: node scripts/show-user-data.js <user_id|email> [--only=preference_events,sessions]
 *
 * Every user-scoped collection stores the owner as a top-level string field
 * `user_id` (not the users._id ObjectId), so we resolve the identifier to
 * that string first, then query each collection with it.
 */
const { MongoClient } = require('mongodb');

const MONGO_URL =
  process.env.MONGO_URL ||
  'mongodb://localhost:27017/coach_platform?replicaSet=rs0';

// Collections that carry a top-level `user_id` string field.
// `user_preferences` is the CQRS projection built by replaying `preference_events`.
const USER_COLLECTIONS = [
  'preference_events', // append-only preference log
  'user_preferences', // <- "the projection"
  'sessions',
  'planned_sessions',
  'recovery_daily',
  'performance_daily',
  'performance_profile',
  'programs',
  'training_profiles',
  'scheduled_week_builds',
  'user_integrations',
  'garmin_sync_schedules',
  'conversations',
  'conversation_messages',
  'pending_card_batches',
  'auto_mode_runs',
  'auth_credentials',
  'auth_sessions',
];

async function main() {
  const [, , identifier, onlyArg] = process.argv;
  if (!identifier) {
    console.error(
      'Usage: node scripts/show-user-data.js <user_id|email> [--only=col1,col2]',
    );
    process.exit(1);
  }

  const only = onlyArg?.startsWith('--only=')
    ? onlyArg.replace('--only=', '').split(',')
    : null;

  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();

  const user = await db
    .collection('users')
    .findOne({ $or: [{ user_id: identifier }, { email: identifier }] });

  if (!user) {
    console.error(`No user found for "${identifier}" (matched by user_id or email)`);
    await client.close();
    process.exit(1);
  }

  const userId = user.user_id;
  console.log('=== users ===');
  console.log(user);

  const collectionsToShow = only ?? USER_COLLECTIONS;
  for (const name of collectionsToShow) {
    const docs = await db.collection(name).find({ user_id: userId }).toArray();
    console.log(`\n=== ${name} (${docs.length}) ===`);
    docs.forEach((d) => console.log(d));
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
