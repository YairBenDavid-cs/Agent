/*
 * Dump everything stored for a single user across all coach_platform
 * collections. Every collection keys user data by a `user_id` string that
 * matches `users.user_id` (NOT the Mongo `_id`).
 *
 * Run via the wrapper:   ./dump-user-data.sh you@example.com
 * Or directly:           mongosh "<MONGO_URL>" \
 *                          --eval "globalThis.TARGET_EMAIL='you@example.com'" \
 *                          --file dump-user-data.mongosh.js
 *
 * With no email it falls back to the most recently updated user.
 * Secrets (password hashes, encrypted integration tokens) are redacted.
 */

const dbx = db.getSiblingDB('coach_platform');

const EMAIL =
  typeof globalThis.TARGET_EMAIL !== 'undefined' && globalThis.TARGET_EMAIL
    ? globalThis.TARGET_EMAIL
    : null;

const user = EMAIL
  ? dbx.users.findOne({ email: EMAIL })
  : dbx.users.find().sort({ updatedAt: -1 }).limit(1).next();

if (!user) {
  print(EMAIL ? `No user found with email "${EMAIL}".` : 'No users in the database.');
  quit(1);
}

const uid = user.user_id;

function section(title) {
  print('\n' + '='.repeat(72));
  print(title);
  print('='.repeat(72));
}

function dump(title, collection, projection) {
  section(title);
  const cursor = dbx[collection].find({ user_id: uid }, projection ?? {});
  const docs = cursor.toArray();
  print(`(${docs.length} document${docs.length === 1 ? '' : 's'} in "${collection}")`);
  docs.forEach((doc) => print(EJSON.stringify(doc, null, 2)));
}

section(`USER  —  ${user.email}  (user_id: ${uid})`);
print(EJSON.stringify(user, null, 2));

// Onboarding output: the training profile + the patched user fields above.
dump('TRAINING PROFILE', 'training_profiles');

// Everything else keyed to this user.
dump('SESSIONS (workouts)', 'sessions');
dump('RECOVERY (daily)', 'recovery_daily');
dump('PERFORMANCE PROFILE', 'performance_profile');
dump('PERFORMANCE (daily)', 'performance_daily');

// Secrets redacted.
dump('AUTH SESSIONS', 'auth_sessions');
dump('AUTH CREDENTIALS (hash redacted)', 'auth_credentials', {
  password_hash: 0,
  algo: 0,
});
dump('INTEGRATIONS (encrypted tokens redacted)', 'user_integrations', {
  'garmin.password_enc': 0,
  'garmin.session_enc': 0,
  'google_calendar.refresh_token_enc': 0,
  'telegram.bot_token_enc': 0,
});

print('\nDone.');
