import { IntegrationProvider } from '../../domain/integration.model';

/** Secret-free view returned by the API. */
export class IntegrationStatusResponse {
  provider!: IntegrationProvider;
  connected!: boolean;
  updatedAt!: string | null;
}
