import { Global, Module } from '@nestjs/common';
import { MimeGuardService } from './mime-guard.service';
import { StorageService } from './storage.service';
import { STORAGE_SERVICE } from './storage.tokens';

@Global()
@Module({
  providers: [
    StorageService,
    MimeGuardService,
    { provide: STORAGE_SERVICE, useExisting: StorageService },
  ],
  exports: [StorageService, MimeGuardService, STORAGE_SERVICE],
})
export class StorageModule {}
