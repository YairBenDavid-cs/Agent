/* Dump the last N messages of a conversation (newest last).
 * Usage: node scripts/dump-conversation.js [conversationId] [limit]
 * No id → uses the most recently updated conversation.
 */
const { MongoClient } = require('mongodb');

const MONGO_URL =
  process.env.MONGO_URL ||
  'mongodb://localhost:27017/coach_platform?replicaSet=rs0';

async function main() {
  const [, , idArg, limitArg] = process.argv;
  const limit = Number(limitArg) || 12;
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();

  let convo;
  if (idArg) {
    convo = await db.collection('conversations').findOne({
      $or: [{ _id: idArg }, { id: idArg }],
    });
    if (!convo) {
      // Mongoose ObjectId fallback
      const { ObjectId } = require('mongodb');
      try {
        convo = await db
          .collection('conversations')
          .findOne({ _id: new ObjectId(idArg) });
      } catch {}
    }
  } else {
    convo = await db
      .collection('conversations')
      .find()
      .sort({ updatedAt: -1 })
      .limit(1)
      .next();
  }
  if (!convo) {
    console.error('conversation not found');
    process.exit(1);
  }

  console.log('=== conversation ===');
  console.log({
    id: String(convo._id),
    title: convo.title,
    kind: convo.kind,
    pendingCardBatchId: convo.pending_card_batch_id ?? convo.pendingCardBatchId ?? null,
    buildContext: convo.build_context ?? convo.buildContext ?? null,
    updatedAt: convo.updatedAt,
  });

  const messages = await db
    .collection('conversation_messages')
    .find({ conversation_id: String(convo._id) })
    .sort({ seq: -1 })
    .limit(limit)
    .toArray();

  console.log(`\n=== last ${messages.length} messages (oldest first) ===`);
  for (const m of messages.reverse()) {
    console.log('---');
    console.log(`#${m.seq} [${m.createdAt?.toISOString?.() ?? m.createdAt}] ${m.role}`);
    console.log(m.content);
    if (m.meta && Object.keys(m.meta).length > 0) {
      console.log('meta:', JSON.stringify(m.meta));
    }
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
