// Public link targets outside /api/v1 (TRD SH-01/02, App Flow §11): the landing page for /p/:id and
// /u/:username, and the files Android and iOS fetch to verify App Links / Universal Links.
import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.decorators.js';
import { AppConfig } from '../../config/app-config.js';
import { USERNAME_PATTERN } from '../auth/auth.dto.js';
import { landingPage } from './landing-page.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_SCHEME = 'jamiiair://';
const LINK_PATHS = ['/p/*', '/u/*'];

/** Served without the /api/v1 prefix (see app.setup.ts). */
export const LINK_ROUTES = ['p/:id', 'u/:username', '.well-known/assetlinks.json', '.well-known/apple-app-site-association'];

@ApiExcludeController()
@Public()
@Controller()
export class LinksController {
  constructor(private readonly config: AppConfig) {}

  @Get('p/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  post(@Param('id') id: string): string {
    if (!UUID.test(id)) throw new NotFoundException();
    return this.page(`${APP_SCHEME}p/${id.toLowerCase()}`);
  }

  @Get('u/:username')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  profile(@Param('username') username: string): string {
    if (!USERNAME_PATTERN.test(username)) throw new NotFoundException();
    return this.page(`${APP_SCHEME}u/${username}`);
  }

  /** Android App Links: https://developer.android.com/training/app-links/verify-android-applinks */
  @Get('.well-known/assetlinks.json')
  @Header('Cache-Control', 'public, max-age=3600')
  assetLinks() {
    const { androidPackage, androidCertSha256 } = this.config.links;
    if (!androidPackage || androidCertSha256.length === 0) return [];
    return [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: androidCertSha256 },
    }];
  }

  /** iOS Universal Links (served as JSON, no extension, no redirect). */
  @Get('.well-known/apple-app-site-association')
  @Header('Cache-Control', 'public, max-age=3600')
  appleAppSiteAssociation() {
    const { iosAppId } = this.config.links;
    return {
      applinks: {
        details: iosAppId ? [{ appIDs: [iosAppId], components: LINK_PATHS.map((path) => ({ '/': path })) }] : [],
      },
    };
  }

  private page(appUrl: string): string {
    const { androidPackage, iosStoreUrl } = this.config.links;
    return landingPage({
      appUrl,
      playStoreUrl: androidPackage ? `https://play.google.com/store/apps/details?id=${androidPackage}` : null,
      appStoreUrl: iosStoreUrl,
    });
  }
}
