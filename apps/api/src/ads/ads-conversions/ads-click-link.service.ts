import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { clickUrlBase } from './conversion-rules'

/** Monta o endereço do botão do anúncio (`<base>/<id-do-clique>`). A base vem da configuração. */
@Injectable()
export class AdsClickLinkService {
  constructor(private readonly config: ConfigService) {}

  build(token: string): string {
    return `${clickUrlBase({
      AD_CLICK_URL_BASE: this.config.get<string>('AD_CLICK_URL_BASE'),
      APP_URL: this.config.get<string>('APP_URL'),
      PORT: this.config.get<string>('PORT'),
      NODE_ENV: this.config.get<string>('NODE_ENV'),
    })}/${token}`
  }
}
