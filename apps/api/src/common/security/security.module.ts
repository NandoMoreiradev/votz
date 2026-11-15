import { Global, Module } from '@nestjs/common'
import { OriginCsrfGuard } from './origin-csrf.guard'
import { SocketSessionRegistry } from './socket-session.registry'

@Global()
@Module({
  providers: [SocketSessionRegistry, OriginCsrfGuard],
  exports: [SocketSessionRegistry, OriginCsrfGuard],
})
export class SecurityModule {}
