import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getActiveSession } from '../../common/transaction/transaction.context';
import { AuthSession as AuthSessionModel } from '../domain/auth-session.model';
import { AuthSessionsRepositoryPort } from '../domain/auth-sessions.repository.port';
import { AuthSession } from './auth-session.schema';

const toDomain = (doc: AuthSession): AuthSessionModel => ({
  userId: doc.user_id,
  jti: doc.jti,
  refreshTokenHash: doc.refresh_token_hash,
  expiresAt: doc.expires_at,
  revokedAt: doc.revoked_at,
});

@Injectable()
export class AuthSessionsRepository implements AuthSessionsRepositoryPort {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly model: Model<AuthSession>,
  ) {}

  async create(session: AuthSessionModel): Promise<void> {
    const txn = getActiveSession();
    await this.model.create(
      [
        {
          user_id: session.userId,
          jti: session.jti,
          refresh_token_hash: session.refreshTokenHash,
          expires_at: session.expiresAt,
          revoked_at: session.revokedAt,
        },
      ],
      { session: txn },
    );
  }

  async findByJti(jti: string): Promise<AuthSessionModel | null> {
    const doc = await this.model
      .findOne({ jti })
      .session(getActiveSession() ?? null)
      .lean<AuthSession>()
      .exec();
    return doc ? toDomain(doc) : null;
  }

  async revokeByJti(jti: string, revokedAt: string): Promise<void> {
    await this.model
      .updateOne(
        { jti, revoked_at: null },
        { $set: { revoked_at: revokedAt } },
        { session: getActiveSession() ?? undefined },
      )
      .exec();
  }

  async revokeAllForUser(userId: string, revokedAt: string): Promise<void> {
    await this.model
      .updateMany(
        { user_id: userId, revoked_at: null },
        { $set: { revoked_at: revokedAt } },
        { session: getActiveSession() ?? undefined },
      )
      .exec();
  }
}
