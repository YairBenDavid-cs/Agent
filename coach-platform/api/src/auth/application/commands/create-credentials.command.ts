/** Hash + persist a user's password. Used inside the register transaction. */
export class CreateCredentialsCommand {
  constructor(
    public readonly userId: string,
    public readonly password: string,
  ) {}
}
