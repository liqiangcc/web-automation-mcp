export interface LoginCommand {
  readonly profileId: string;
}

export interface LoginResult {
  readonly profileId: string;
  readonly message: string;
}

export async function login(command: LoginCommand): Promise<LoginResult> {
  return {
    profileId: command.profileId,
    message: 'Login flow will open persistent browser profile in the next implementation step.',
  };
}
