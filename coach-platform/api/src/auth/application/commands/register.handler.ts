import { ConflictException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionManager } from '../../../common/transaction/transaction.manager';
import { ApiError } from '../../../common/errors/api-error';
import { CreateUserCommand } from '../../../users/application/commands/create-user.command';
import { CreateUserDto } from '../../../users/application/dto/create-user.dto';
import { AuthResult } from '../dto/auth-result';
import { SessionIssuer } from '../services/session-issuer.service';
import { CreateCredentialsCommand } from './create-credentials.command';
import { RegisterCommand } from './register.command';

/**
 * Creates the user profile + password credential atomically (one Mongo
 * transaction), then issues the first session. If anything fails — including a
 * duplicate email — the whole thing rolls back, so we never leave a user without
 * credentials or vice versa.
 */
@CommandHandler(RegisterCommand)
export class RegisterHandler
  implements ICommandHandler<RegisterCommand, AuthResult>
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly txn: TransactionManager,
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthResult> {
    const { password, ...profile } = command.dto;

    return this.txn.runInTransaction(async () => {
      let userId: string;
      try {
        const created = await this.commandBus.execute<
          CreateUserCommand,
          { id: string }
        >(new CreateUserCommand(profile as CreateUserDto));
        userId = created.id;
      } catch (err) {
        // Translate the users-context conflict into the auth-stable error code.
        if (err instanceof ConflictException) throw ApiError.emailTaken();
        throw err;
      }

      await this.commandBus.execute(
        new CreateCredentialsCommand(userId, password),
      );

      // New accounts are always role 'user'.
      const tokens = await this.sessionIssuer.issue(userId, 'user');
      return { tokens, user: { userId, role: 'user' } };
    });
  }
}
