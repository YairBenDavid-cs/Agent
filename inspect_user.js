// Inspect a single user across every collection in coach_platform.
//
// Usage:
//   1. Set UID below to a user_id (copy one from the "all users" list it prints
//      when UID is empty).
//   2. Run it:
//        mongosh "mongodb://localhost:27017/coach_platform" inspect_user.js
//
//   Tip: leave UID = "" to just list all users (with their user_id) and exit.

const UID = "u_be155ec3-b28d-4d5f-a683-8c8b908504fd"; // <-- PASTE a user_id here

// ---------------------------------------------------------------------------

const hr = (t) => print("\n========== " + t + " ==========");

function listAllUsers() {
  print("No UID set. Available users:\n");
  db.users
    .find({}, { user_id: 1, email: 1, name: 1, role: 1, status: 1, _id: 0 })
    .forEach((u) =>
      print(
        "  " +
          (u.user_id || "?") +
          "  | " +
          (u.name || "-") +
          " <" +
          (u.email || "-") +
          ">  [" +
          (u.role || "-") +
          "/" +
          (u.status || "-") +
          "]",
      ),
    );
  print("\nSet UID at the top of inspect_user.js to one of the above and re-run.");
}

function dump(title, cursorOrDoc) {
  hr(title);
  printjson(cursorOrDoc);
}

function dumpMany(title, coll, query, sort) {
  hr(title);
  let c = db[coll].find(query);
  if (sort) c = c.sort(sort);
  const docs = c.toArray();
  print("count: " + docs.length);
  docs.forEach((d) => printjson(d));
}

function inspectUser(uid) {
  const user = db.users.findOne({ user_id: uid });
  if (!user) {
    print('No user found with user_id = "' + uid + '".\n');
    listAllUsers();
    return;
  }

  print("####################################################");
  print("# USER: " + (user.name || "-") + " <" + (user.email || "-") + ">");
  print("# user_id: " + uid);
  print("####################################################");

  // Account / onboarding profile
  dump("users (account + onboarding profile)", user);

  // Secrets
  dump("auth_credentials (password hash)", db.auth_credentials.findOne({ user_id: uid }));
  dump("user_integrations (garmin/google/telegram tokens)", db.user_integrations.findOne({ user_id: uid }));
  dumpMany("auth_sessions", "auth_sessions", { user_id: uid }, { createdAt: -1 });

  // Training
  dumpMany("training_profiles", "training_profiles", { user_id: uid }, { createdAt: 1 });
  dumpMany("programs", "programs", { user_id: uid }, { createdAt: 1 });
  dumpMany("planned_sessions", "planned_sessions", { user_id: uid }, { scheduledDate: 1 });
  dumpMany("sessions (observed)", "sessions", { user_id: uid }, { date: 1 });

  // Performance & recovery
  dumpMany("performance_daily", "performance_daily", { user_id: uid }, { date: 1 });
  dumpMany("performance_profile", "performance_profile", { user_id: uid }, { effective_date: 1 });
  dumpMany("recovery_daily", "recovery_daily", { user_id: uid }, { date: 1 });

  // Personalization
  dumpMany("preference_events", "preference_events", { user_id: uid }, { createdAt: 1 });
  dump("user_preferences (projection)", db.user_preferences.findOne({ user_id: uid }));
  dumpMany("health_constraints", "health_constraints", { user_id: uid }, { createdAt: 1 });

  // Agents / chat
  dumpMany("conversations", "conversations", { user_id: uid }, { createdAt: 1 });
  dumpMany("conversation_messages", "conversation_messages", { user_id: uid }, { createdAt: 1 });
  dumpMany("pending_card_batches", "pending_card_batches", { user_id: uid }, { createdAt: 1 });

  // Compact summary footer
  hr("SUMMARY (counts)");
  const integ = db.user_integrations.findOne({ user_id: uid });
  print("  role/status      : " + user.role + " / " + user.status);
  print(
    "  onboarding       : dob=" + user.date_of_birth + " sex=" + user.sex + " tz=" + user.timezone +
      " h=" + user.height_cm + "cm w=" + user.weight_kg + "kg",
  );
  print("  garmin           : " + (integ?.garmin ? "YES (" + integ.garmin.email + ")" : "no"));
  print("  google_calendar  : " + (integ?.google_calendar ? "YES (refresh token stored)" : "no"));
  print("  password hash    : " + (db.auth_credentials.findOne({ user_id: uid }) ? "stored" : "MISSING"));
  print("  training_profiles: " + db.training_profiles.countDocuments({ user_id: uid }));
  print("  programs         : " + db.programs.countDocuments({ user_id: uid }));
  print("  planned_sessions : " + db.planned_sessions.countDocuments({ user_id: uid }));
  print("  sessions         : " + db.sessions.countDocuments({ user_id: uid }));
  print("  performance_daily: " + db.performance_daily.countDocuments({ user_id: uid }));
  print("  performance_prof : " + db.performance_profile.countDocuments({ user_id: uid }));
  print("  recovery_daily   : " + db.recovery_daily.countDocuments({ user_id: uid }));
  print("  preference_events: " + db.preference_events.countDocuments({ user_id: uid }));
  print("  health_constraint: " + db.health_constraints.countDocuments({ user_id: uid }));
  print("  conversations    : " + db.conversations.countDocuments({ user_id: uid }));
  print("  conv_messages    : " + db.conversation_messages.countDocuments({ user_id: uid }));
}

if (!UID || UID === "PASTE_user_id_HERE") {
  listAllUsers();
} else {
  inspectUser(UID);
}
