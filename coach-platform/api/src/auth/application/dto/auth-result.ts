import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { TokenPair } from '../../domain/tokens';

/**
 * Internal result of an auth flow: the freshly issued tokens (for the cookie
 * service to write) plus the identity (for the JSON response body). Tokens never
 * appear in the response body — only in httpOnly cookies.
 */
export interface AuthResult {
  tokens: TokenPair;
  user: AuthenticatedUser;
}
