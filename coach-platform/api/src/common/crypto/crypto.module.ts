import { Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/** Shared encryption capability. Imported by any context that stores secrets. */
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
