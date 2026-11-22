/**
 * Padrão de fotos e vídeos do Votz (docs/dev/padrao-de-midia-plano-2026-11-21.md).
 *
 * Publicações e anúncios usam três formatos. Relatos NÃO são recortados (a foto é prova): aparecem inteiros
 * dentro da moldura do formato mais próximo. API, site, celular e servidor de anúncios leem tudo daqui.
 */
export type MediaFormat = 'SQUARE' | 'PORTRAIT' | 'LANDSCAPE';
export interface MediaFormatSpec {
    format: MediaFormat;
    /** Nome que a pessoa vê. */
    label: string;
    /** Proporção escrita como as pessoas conhecem. */
    ratioLabel: string;
    /** Largura ÷ altura. */
    ratio: number;
    /** Tamanho de referência (o que recomendamos enviar e o que os anúncios exigem). */
    width: number;
    height: number;
}
export declare const MEDIA_FORMATS: Record<MediaFormat, MediaFormatSpec>;
/** Ordem dos botões no editor. */
export declare const MEDIA_FORMAT_ORDER: readonly MediaFormat[];
export declare const DEFAULT_MEDIA_FORMAT: MediaFormat;
/** Arquivos gerados pelo servidor a partir do recorte. */
export declare const MEDIA_VARIANTS: {
    /** Miniatura para listas. */
    readonly THUMB_WIDTH: 400;
    /** Versão que o feed mostra. */
    readonly FEED_WIDTH: 1080;
    /** Versão cheia (tela cheia, zoom): maior lado. */
    readonly FULL_MAX_EDGE: 2048;
    /** A foto original fica guardada (privada, sem metadados) até no máximo isso, para o recorte ter qualidade. */
    readonly SOURCE_MAX_EDGE: 4096;
};
/** Quantas fotos ou vídeos cabem numa publicação. */
export declare const POST_MEDIA_MAX_ITEMS = 4;
/** Menor lado aceito do recorte, em pixels da foto original. */
export declare const MEDIA_MIN_CROP_EDGE = 200;
/** Quanto o editor deixa aproximar. */
export declare const MEDIA_MAX_ZOOM = 5;
/** Diferença aceita entre a proporção do recorte e a do formato (arredondamento de pixels). */
export declare const MEDIA_RATIO_TOLERANCE = 0.02;
/** Exigências dos anúncios (plano de anúncios, seção 2.3 do padrão de mídia). */
export declare const AD_MEDIA_MIN_WIDTH = 1080;
export declare const AD_VIDEO_MAX_SECONDS = 60;
export type MediaAssetKind = 'IMAGE' | 'VIDEO' | 'GIF';
/** `cover`: o arquivo já tem a proporção da moldura. `contain`: aparece inteiro, com fundo desfocado (relatos, GIFs, posts antigos). */
export type MediaFit = 'cover' | 'contain';
export type MediaItemStatus = 'READY' | 'PROCESSING' | 'FAILED';
/** Recorte em frações (0 a 1) da imagem original, como a pessoa vê (já girada). */
export interface MediaCrop {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** Item de mídia como a API devolve, pronto para desenhar. */
export interface MediaItemDto {
    /** Nulo em relatos e itens sem registro próprio. */
    id: string | null;
    kind: MediaAssetKind;
    /** Moldura. Nulo só quando o servidor não sabe o tamanho (arquivo antigo): o app mede ao carregar. */
    format: MediaFormat | null;
    fit: MediaFit;
    /** Tamanho do arquivo mostrado. */
    width: number | null;
    height: number | null;
    /** Nulo enquanto o vídeo processa. */
    url: string | null;
    fullUrl: string | null;
    thumbUrl: string | null;
    posterUrl: string | null;
    status: MediaItemStatus;
    durationMs: number | null;
}
/** Resposta do envio de um arquivo para publicação (ainda sem recorte). */
export interface UploadedMediaAssetDto {
    id: string;
    kind: MediaAssetKind;
    /** Tamanho como a pessoa vê (foto girada pela câmera, vídeo gravado em pé). */
    width: number;
    height: number;
    durationMs: number | null;
}
/** Formato cuja proporção fica mais perto da do arquivo. No empate (4:3 fica no meio de 1:1 e 16:9), vale o primeiro da lista: o quadrado, que mostra a foto maior. */
export declare function nearestMediaFormat(width: number | null | undefined, height: number | null | undefined): MediaFormat | null;
/** Altura ÷ largura da moldura (o celular usa assim). */
export declare function mediaFrameHeightRatio(format: MediaFormat): number;
/** Maior recorte com a proporção do formato que cabe na imagem (zoom 1), em pixels. */
export declare function baseCropSize(sourceWidth: number, sourceHeight: number, format: MediaFormat): {
    width: number;
    height: number;
};
/** Zoom máximo do editor para esta imagem: não deixa o recorte ficar menor que MEDIA_MIN_CROP_EDGE. */
export declare function maxCropZoom(sourceWidth: number, sourceHeight: number, format: MediaFormat): number;
/**
 * Recorte a partir do que o editor mostra: zoom (1 = a maior moldura que cabe) e centro (frações da imagem).
 * O centro é ajustado para a moldura nunca sair da imagem.
 */
export declare function cropFromView(sourceWidth: number, sourceHeight: number, format: MediaFormat, view: {
    zoom: number;
    centerX: number;
    centerY: number;
}): MediaCrop;
/** O contrário de `cropFromView`: zoom e centro de um recorte guardado. */
export declare function viewFromCrop(sourceWidth: number, sourceHeight: number, format: MediaFormat, crop: MediaCrop): {
    zoom: number;
    centerX: number;
    centerY: number;
};
/** Recorte centralizado, sem zoom (o que o editor mostra ao abrir). */
export declare function defaultCrop(sourceWidth: number, sourceHeight: number, format: MediaFormat): MediaCrop;
/**
 * Recorte em pixels inteiros, com a proporção exata do formato (a largura manda; a altura é ajustada e,
 * se passar da borda, os dois diminuem juntos).
 */
export declare function cropToPixels(sourceWidth: number, sourceHeight: number, format: MediaFormat, crop: MediaCrop): {
    left: number;
    top: number;
    width: number;
    height: number;
};
/**
 * Confere um recorte recebido do app. Devolve a mensagem para a pessoa (português simples) ou null se está certo.
 */
export declare function validateMediaCrop(sourceWidth: number, sourceHeight: number, format: MediaFormat, crop: MediaCrop): string | null;
/** Tamanho final de cada versão gerada a partir de um recorte de `cropWidth` × `cropHeight` pixels. */
export declare function mediaVariantSizes(format: MediaFormat, cropWidth: number, cropHeight: number): {
    feed: {
        width: 1080;
        height: number;
    };
    full: {
        width: number;
        height: number;
    };
    thumb: {
        width: 400;
        height: number;
    };
    video: {
        width: number;
        height: number;
    };
};
export declare function mediaKindFromUrl(url: string): MediaAssetKind;
/**
 * Itens a partir só dos links (publicação ou resposta antiga, sem `mediaItems`). A moldura fica por conta do
 * app, que mede ao carregar; o arquivo aparece inteiro. A capa do vídeo segue a convenção `<arquivo>.poster.jpg`.
 */
export declare function legacyMediaItems(urls: readonly string[]): MediaItemDto[];
/** Moldura de um conjunto (carrossel): a do primeiro item com formato conhecido. */
export declare function mediaSetFormat(items: readonly Pick<MediaItemDto, 'format'>[]): MediaFormat | null;
//# sourceMappingURL=media.d.ts.map