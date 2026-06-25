import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  StoredGarmin,
  StoredGoogleCalendar,
  StoredTelegram,
  UserIntegrationsRecord,
} from '../domain/integrations.record';
import { IntegrationsRepositoryPort } from '../domain/integrations.repository.port';
import {
  GarminCreds,
  GoogleCalendarCreds,
  TelegramCreds,
  UserIntegrations,
} from './user-integrations.schema';

const garminToDomain = (g: GarminCreds): StoredGarmin => ({
  email: g.email,
  passwordEnc: g.password_enc,
  sessionEnc: g.session_enc,
  sessionExpiresAt: g.session_expires_at,
  updatedAt: g.updated_at,
});

const gcalToDomain = (g: GoogleCalendarCreds): StoredGoogleCalendar => ({
  refreshTokenEnc: g.refresh_token_enc,
  updatedAt: g.updated_at,
});

const telegramToDomain = (t: TelegramCreds): StoredTelegram => ({
  chatId: t.chat_id,
  botTokenEnc: t.bot_token_enc,
  updatedAt: t.updated_at,
});

const toDomain = (doc: UserIntegrations): UserIntegrationsRecord => ({
  userId: doc.user_id,
  garmin: doc.garmin ? garminToDomain(doc.garmin) : null,
  googleCalendar: doc.google_calendar
    ? gcalToDomain(doc.google_calendar)
    : null,
  telegram: doc.telegram ? telegramToDomain(doc.telegram) : null,
});

@Injectable()
export class IntegrationsRepository implements IntegrationsRepositoryPort {
  constructor(
    @InjectModel(UserIntegrations.name)
    private readonly model: Model<UserIntegrations>,
  ) {}

  async find(userId: string): Promise<UserIntegrationsRecord | null> {
    const doc = await this.model
      .findOne({ user_id: userId })
      .lean<UserIntegrations>()
      .exec();
    return doc ? toDomain(doc) : null;
  }

  async upsertGarmin(userId: string, garmin: StoredGarmin): Promise<void> {
    await this.model
      .updateOne(
        { user_id: userId },
        {
          $setOnInsert: { user_id: userId },
          $set: {
            garmin: {
              email: garmin.email,
              password_enc: garmin.passwordEnc,
              session_enc: garmin.sessionEnc,
              session_expires_at: garmin.sessionExpiresAt,
              updated_at: garmin.updatedAt,
            },
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async upsertGoogleCalendar(
    userId: string,
    googleCalendar: StoredGoogleCalendar,
  ): Promise<void> {
    await this.model
      .updateOne(
        { user_id: userId },
        {
          $setOnInsert: { user_id: userId },
          $set: {
            google_calendar: {
              refresh_token_enc: googleCalendar.refreshTokenEnc,
              updated_at: googleCalendar.updatedAt,
            },
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async upsertTelegram(userId: string, telegram: StoredTelegram): Promise<void> {
    await this.model
      .updateOne(
        { user_id: userId },
        {
          $setOnInsert: { user_id: userId },
          $set: {
            telegram: {
              chat_id: telegram.chatId,
              bot_token_enc: telegram.botTokenEnc,
              updated_at: telegram.updatedAt,
            },
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async updateGarminSession(
    userId: string,
    sessionEnc: string,
    sessionExpiresAt: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { user_id: userId, garmin: { $ne: null } },
        {
          $set: {
            'garmin.session_enc': sessionEnc,
            'garmin.session_expires_at': sessionExpiresAt,
          },
        },
      )
      .exec();
  }
}
