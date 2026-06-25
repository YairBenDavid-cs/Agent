import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { CreateUserHandler } from './application/commands/create-user.handler';
import { UpdateUserProfileHandler } from './application/commands/update-user-profile.handler';
import { GetUserHandler } from './application/queries/get-user.handler';
import { USERS_REPOSITORY } from './domain/users.repository.port';
import { User, UserSchema } from './infrastructure/user.schema';
import { UsersRepository } from './infrastructure/users.repository';
import { UsersController } from './interface/users.controller';

const CommandHandlers = [CreateUserHandler, UpdateUserProfileHandler];
const QueryHandlers = [GetUserHandler];

@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController],
  providers: [
    { provide: USERS_REPOSITORY, useClass: UsersRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  // The repository token is internal. Other contexts that need to enumerate
  // tenants do so via the ingestion orchestrator, not by importing this module.
  exports: [USERS_REPOSITORY],
})
export class UsersModule {}
