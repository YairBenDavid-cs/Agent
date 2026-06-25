import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getActiveSession } from '../../common/transaction/transaction.context';
import { AuthCredentials as AuthCredentialsModel } from '../domain/auth-credentials.model';
import { AuthCredentialsRepositoryPort } from '../domain/auth-credentials.repository.port';
import { AuthCredentials } from './auth-credentials.schema';

const toDomain = (doc: AuthCredentials): AuthCredentialsModel => ({
  userId: doc.user_id,
  passwordHash: doc.password_hash,
  algo: doc.algo,
});

@Injectable()
export class AuthCredentialsRepository
  implements AuthCredentialsRepositoryPort
{
  constructor(
    @InjectModel(AuthCredentials.name)
    private readonly model: Model<AuthCredentials>,
  ) {}

  async create(credentials: AuthCredentialsModel): Promise<void> {
    const session = getActiveSession();
    await this.model.create(
      [
        {
          user_id: credentials.userId,
          password_hash: credentials.passwordHash,
          algo: credentials.algo,
        },
      ],
      { session },
    );
  }

  async findByUserId(userId: string): Promise<AuthCredentialsModel | null> {
    const doc = await this.model
      .findOne({ user_id: userId })
      .lean<AuthCredentials>()
      .exec();
    return doc ? toDomain(doc) : null;
  }
}
