import { Module } from '@nestjs/common';
import { ChatGeneralController } from './chat-general.controller';
import { ChatGeneralRepository } from './chat-general.repository';
import { ChatGeneralService } from './chat-general.service';

@Module({
  controllers: [ChatGeneralController],
  providers: [ChatGeneralService, ChatGeneralRepository],
  exports: [ChatGeneralService],
})
export class ChatGeneralModule {}
