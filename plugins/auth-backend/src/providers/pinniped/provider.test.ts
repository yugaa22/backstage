/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { setupRequestMockHandlers } from '@backstage/backend-test-utils';
import {
  OAuthRefreshRequest,
  OAuthStartRequest,
  encodeState,
  readState,
} from '../../lib/oauth';
import { PinnipedAuthProvider, PinnipedProviderOptions } from './provider';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import express from 'express';
import { OAuthState } from '../../lib/oauth';
import { Server } from 'http';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { ConfigReader } from '@backstage/config';
import Router from 'express-promise-router';
import { pinniped } from '.';
import { AuthProviderRouteHandlers } from '../types';
import { getVoidLogger } from '@backstage/backend-common';
import { AddressInfo } from 'net';
import request from 'supertest';
import { JWK, SignJWT, exportJWK, generateKeyPair } from 'jose';

describe('PinnipedAuthProvider', () => {
  let provider: PinnipedAuthProvider;
  let idToken: string;
  let publicKey: JWK;
  let oauthState: OAuthState;

  const mswServer = setupServer();
  setupRequestMockHandlers(mswServer);

  const issuerMetadata = {
    issuer: 'https://pinniped.test',
    authorization_endpoint: 'https://pinniped.test/oauth2/authorize',
    token_endpoint: 'https://pinniped.test/oauth2/token',
    revocation_endpoint: 'https://pinniped.test/oauth2/revoke_token',
    userinfo_endpoint: 'https://pinniped.test/idp/userinfo.openid',
    introspection_endpoint: 'https://pinniped.test/introspect.oauth2',
    jwks_uri: 'https://pinniped.test/jwks.json',
    scopes_supported: [
      'openid',
      'offline_access',
      'pinniped:request-audience',
      'username',
      'groups',
    ],
    claims_supported: ['email', 'username', 'groups', 'additionalClaims'],
    response_types_supported: ['code'],
    id_token_signing_alg_values_supported: ['RS256', 'RS512', 'HS256'],
    token_endpoint_auth_signing_alg_values_supported: [
      'RS256',
      'RS512',
      'HS256',
    ],
    request_object_signing_alg_values_supported: ['RS256', 'RS512', 'HS256'],
  };

  const pinnipedProviderOptions: PinnipedProviderOptions = {
    federationDomain: 'https://federationDomain.test',
    clientId: 'clientId',
    clientSecret: 'secret',
    callbackUrl: 'https://backstage.test/callback',
  };

  const clusterScopedIdToken = 'dummy-token';

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    const privateKey = await exportJWK(keyPair.privateKey);
    publicKey = await exportJWK(keyPair.publicKey);
    publicKey.alg = privateKey.alg = 'RS256';

    idToken = await new SignJWT({
      sub: 'test',
      iss: 'https://pinniped.test',
      iat: Date.now(),
      aud: pinnipedProviderOptions.clientId,
      exp: Date.now() + 10000,
    })
      .setProtectedHeader({ alg: privateKey.alg, kid: privateKey.kid })
      .sign(keyPair.privateKey);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mswServer.use(
      rest.get(
        'https://federationDomain.test/.well-known/openid-configuration',
        (_req, res, ctx) =>
          res(
            ctx.status(200),
            ctx.set('Content-Type', 'application/json'),
            ctx.json(issuerMetadata),
          ),
      ),
      rest.get(
        'https://pinniped.test/oauth2/authorize',
        async (req, res, ctx) => {
          const callbackUrl = new URL(
            req.url.searchParams.get('redirect_uri')!,
          );
          callbackUrl.searchParams.set('code', 'authorization_code');
          callbackUrl.searchParams.set(
            'state',
            req.url.searchParams.get('state')!,
          );
          callbackUrl.searchParams.set('scope', 'test-scope');
          return res(
            ctx.status(302),
            ctx.set('Location', callbackUrl.toString()),
          );
        },
      ),
      rest.get('https://pinniped.test/jwks.json', async (_req, res, ctx) =>
        res(ctx.status(200), ctx.json({ keys: [{ ...publicKey }] })),
      ),
      rest.post('https://pinniped.test/oauth2/token', async (req, res, ctx) => {
        const formBody = new URLSearchParams(await req.text());
        const isGrantTypeTokenExchange =
          formBody.get('grant_type') ===
          'urn:ietf:params:oauth:grant-type:token-exchange';
        const hasValidTokenExchangeParams =
          formBody.get('subject_token') === 'accessToken' &&
          formBody.get('audience') === 'test_cluster' &&
          formBody.get('subject_token_type') ===
            'urn:ietf:params:oauth:token-type:access_token' &&
          formBody.get('requested_token_type') ===
            'urn:ietf:params:oauth:token-type:jwt';

        return res(
          req.headers.get('Authorization') &&
            (!isGrantTypeTokenExchange || hasValidTokenExchangeParams)
            ? ctx.json({
                access_token: isGrantTypeTokenExchange
                  ? clusterScopedIdToken
                  : 'accessToken',
                refresh_token: 'refreshToken',
                ...(!isGrantTypeTokenExchange && { id_token: idToken }),
                scope: 'testScope',
              })
            : ctx.status(401),
        );
      }),
    );

    oauthState = {
      nonce: 'nonce',
      env: 'env',
    };

    provider = new PinnipedAuthProvider(pinnipedProviderOptions);
  });

  describe('#start', () => {
    let fakeSession: Record<string, any>;
    let startRequest: OAuthStartRequest;

    beforeEach(() => {
      fakeSession = {};
      startRequest = {
        session: fakeSession,
        method: 'GET',
        url: 'test',
        state: oauthState,
      } as unknown as OAuthStartRequest;
    });

    it('redirects to authorization endpoint returned from OIDC metadata endpoint', async () => {
      const startResponse = await provider.start(startRequest);
      const url = new URL(startResponse.url);

      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('pinniped.test');
      expect(url.pathname).toBe('/oauth2/authorize');
    });

    it('initiates authorization code grant', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('response_type')).toBe('code');
    });

    it('persists audience parameter in oauth state', async () => {
      startRequest.query = { audience: 'test-cluster' };
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);
      const stateParam = searchParams.get('state');
      const decodedState = readState(stateParam!);

      expect(decodedState).toMatchObject({
        nonce: 'nonce',
        env: 'env',
        audience: 'test-cluster',
      });
    });

    it('passes client ID from config', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('client_id')).toBe('clientId');
    });

    it('passes callback URL from config', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('redirect_uri')).toBe(
        'https://backstage.test/callback',
      );
    });

    it('generates PKCE challenge', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('code_challenge_method')).toBe('S256');
      expect(searchParams.get('code_challenge')).not.toBeNull();
    });

    it('stores PKCE verifier in session', async () => {
      await provider.start(startRequest);
      expect(fakeSession['oidc:pinniped.test'].code_verifier).toBeDefined();
    });

    it('requests sufficient scopes for token exchange', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);
      const scopes = searchParams.get('scope')?.split(' ') ?? [];

      expect(scopes).toEqual(
        expect.arrayContaining([
          'openid',
          'pinniped:request-audience',
          'username',
          'offline_access',
        ]),
      );
    });

    it('encodes OAuth state in query param', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);
      const stateParam = searchParams.get('state');
      const decodedState = readState(stateParam!);

      expect(decodedState).toMatchObject(oauthState);
    });

    it('fails when request has no session', async () => {
      return expect(
        provider.start({
          method: 'GET',
          url: 'test',
        } as unknown as OAuthStartRequest),
      ).rejects.toThrow('authentication requires session support');
    });
  });

  describe('#handler', () => {
    let handlerRequest: express.Request;

    beforeEach(() => {
      handlerRequest = {
        method: 'GET',
        url: `https://test?code=authorization_code&state=${encodeState(
          oauthState,
        )}`,
        session: {
          'oidc:pinniped.test': {
            state: encodeState(oauthState),
          },
        },
      } as unknown as express.Request;
    });

    it('exchanges authorization code for access token', async () => {
      const handlerResponse = await provider.handler(handlerRequest);
      const accessToken = handlerResponse.response.providerInfo.accessToken;

      expect(accessToken).toEqual('accessToken');
    });

    it('exchanges authorization code for refresh token', async () => {
      const handlerResponse = await provider.handler(handlerRequest);
      const refreshToken = handlerResponse.refreshToken;

      expect(refreshToken).toEqual('refreshToken');
    });

    it('returns granted scope', async () => {
      const handlerResponse = await provider.handler(handlerRequest);
      const responseScope = handlerResponse.response.providerInfo.scope;

      expect(responseScope).toEqual('testScope');
    });

    it('returns cluster-scoped ID token when audience is specified', async () => {
      oauthState.audience = 'test_cluster';
      handlerRequest = {
        method: 'GET',
        url: `https://test?code=authorization_code&state=${encodeState(
          oauthState,
        )}`,
        session: {
          'oidc:pinniped.test': {
            state: encodeState(oauthState),
          },
        },
      } as unknown as express.Request;

      const handlerResponse = await provider.handler(handlerRequest);
      const responseIdToken = handlerResponse.response.providerInfo.idToken;

      expect(responseIdToken).toEqual(clusterScopedIdToken);
    });

    it('fails without authorization code', async () => {
      handlerRequest.url = 'https://test.com';
      return expect(provider.handler(handlerRequest)).rejects.toThrow(
        'Unexpected redirect',
      );
    });

    it('fails without oauth state', async () => {
      return expect(
        provider.handler({
          method: 'GET',
          url: `https://test?code=authorization_code}`,
          session: {
            ['oidc:pinniped.test']: {
              state: { handle: 'sessionid', code_verifier: 'foo' },
            },
          },
        } as unknown as express.Request),
      ).rejects.toThrow(
        'Authentication rejected, state missing from the response',
      );
    });

    it('fails when request has no session', async () => {
      return expect(
        provider.handler({
          method: 'GET',
          url: 'https://test.com',
        } as unknown as OAuthStartRequest),
      ).rejects.toThrow('authentication requires session support');
    });
  });

  describe('#refresh', () => {
    let refreshRequest: OAuthRefreshRequest;

    beforeEach(() => {
      refreshRequest = {
        refreshToken: 'otherRefreshToken',
      } as unknown as OAuthRefreshRequest;
    });

    it('gets new refresh token', async () => {
      const { refreshToken } = await provider.refresh(refreshRequest);

      expect(refreshToken).toBe('refreshToken');
    });

    it('gets access token', async () => {
      const { response } = await provider.refresh(refreshRequest);

      expect(response.providerInfo.accessToken).toBe('accessToken');
    });

    it('gets id token', async () => {
      const { response } = await provider.refresh(refreshRequest);

      expect(response.providerInfo.idToken).toBe(idToken);
    });
  });

  describe('integration', () => {
    let app: express.Express;
    let providerRouteHandler: AuthProviderRouteHandlers;
    let backstageServer: Server;
    let appUrl: string;

    beforeEach(async () => {
      const secret = 'secret';
      app = express()
        .use(cookieParser(secret))
        .use(
          session({
            secret,
            saveUninitialized: false,
            resave: false,
            cookie: { secure: false },
          }),
        )
        .use(passport.initialize())
        .use(passport.session());
      await new Promise(resolve => {
        backstageServer = app.listen(0, '0.0.0.0', () => {
          appUrl = `http://127.0.0.1:${
            (backstageServer.address() as AddressInfo).port
          }`;
          resolve(null);
        });
      });
      mswServer.use(rest.all(`${appUrl}/*`, req => req.passthrough()));
      providerRouteHandler = pinniped.create()({
        providerId: 'pinniped',
        globalConfig: {
          baseUrl: `${appUrl}/api/auth`,
          appUrl,
          isOriginAllowed: _ => true,
        },
        config: new ConfigReader({
          development: {
            federationDomain: 'https://federationDomain.test',
            clientId: 'clientId',
            clientSecret: 'clientSecret',
          },
        }),
        logger: getVoidLogger(),
        resolverContext: {
          issueToken: async _ => ({ token: '' }),
          findCatalogUser: async _ => ({
            entity: {
              apiVersion: '',
              kind: '',
              metadata: { name: '' },
            },
          }),
          signInWithCatalogUser: async _ => ({ token: '' }),
        },
        baseUrl: `${appUrl}/api/auth`,
        appUrl,
        isOriginAllowed: _ => true,
      });
      const router = Router();
      router
        .use(
          '/api/auth/pinniped/start',
          providerRouteHandler.start.bind(providerRouteHandler),
        )
        .use(
          '/api/auth/pinniped/handler/frame',
          providerRouteHandler.frameHandler.bind(providerRouteHandler),
        );
      app.use(router);
    });

    afterEach(() => {
      backstageServer.close();
    });

    it('/handler/frame exchanges authorization code from #start for Cluster Specific ID token', async () => {
      const agent = request.agent('');

      // make /start request with audience parameter
      const startResponse = await agent.get(
        `${appUrl}/api/auth/pinniped/start?env=development&audience=test_cluster`,
      );
      // follow redirect to authorization endpoint
      const authorizationResponse = await agent.get(
        startResponse.header.location,
      );
      // follow redirect to token_endpoint
      const handlerResponse = await agent.get(
        authorizationResponse.header.location,
      );

      expect(handlerResponse.text).toContain(
        encodeURIComponent(
          JSON.stringify({
            type: 'authorization_response',
            response: {
              providerInfo: {
                accessToken: 'accessToken',
                scope: 'testScope',
                idToken: clusterScopedIdToken,
              },
              profile: {},
            },
          }),
        ),
      );
    });
  });
});
