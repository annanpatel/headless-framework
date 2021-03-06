/**
 * @see https://github.com/vercel/next.js/blob/canary/examples/with-apollo/lib/apolloClient.js
 */
import { useMemo } from 'react';
import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { setContext } from '@apollo/client/link/context';
import merge from 'deepmerge';
import {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  GetStaticPropsContext,
  GetStaticPropsResult,
  NextPageContext,
} from 'next';
import {
  getCookiesFromContext,
  isServerSide,
  trimTrailingSlash,
} from '../utils';
import { CookieOptions, getAccessToken } from '../auth';

export const APOLLO_STATE_PROP_NAME = '__APOLLO_STATE__';

const WP_URL = trimTrailingSlash(
  process.env.NEXT_PUBLIC_WORDPRESS_URL || process.env.WORDPRESS_URL,
);

if (!WP_URL) {
  if (isServerSide()) {
    throw new Error(
      'WORDPRESS_URL and NEXT_PUBLIC_WORDPRESS_URL environment variables are not set. Please set WORDPRESS_URL (or NEXT_PUBLIC_WORDPRESS_URL if you wish to also use client-side requests) to your WPGraphQL endpoint.',
    );
  }
}

/**
 * Creates Apollo Client instance and points it to the WordPress API endpoint specified via environment variables.
 */
function createApolloClient(
  options?: CookieOptions,
): ApolloClient<NormalizedCacheObject> {
  const authLink = setContext((_, { headers }) => {
    const token = getAccessToken(options);

    if (!token) {
      return {};
    }

    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      },
    };
  });

  return new ApolloClient({
    ssrMode: isServerSide(),
    link: WP_URL
      ? authLink.concat(
          new BatchHttpLink({
            uri: `${WP_URL}/graphql`,
          }),
        )
      : undefined,

    cache: new InMemoryCache(),
  });
}

/**
 * Creates the Apollo Client instance if it doesn't already exist. This works on both the client side and server side.
 *
 * If client side, it will hydrate the cache using initial state passed through Next.js' Data Fetching functions.
 *
 * @example
 * ```ts
 * // Client-side
 * // For client-side, it's recommended that you use useApollo() instead initializeApollo() directly.
 * ```
 *
 * @example
 * ```ts
 * // Server-side
 * export async function getStaticProps() {
 *     const apolloClient = initializeApollo()
 *
 *     await apolloClient.query({
 *         query: ALL_POSTS_QUERY,
 *         variables: allPostsQueryVars,
 *     })
 *
 *     return addApolloState(apolloClient, {
 *         props: {},
 *       revalidate: 1,
 *     })
 * }
 * ```
 */
export function initializeApollo(
  context?: NextPageContext | GetStaticPropsContext | GetServerSidePropsContext,
  initialState = null,
): ApolloClient<NormalizedCacheObject> {
  const localApolloClient = createApolloClient({
    cookies: getCookiesFromContext(context),
  });

  if (context) {
    // eslint-disable-next-line no-underscore-dangle
    (context as WithApolloClient).__apollo_client = localApolloClient;
  }

  // If your page has Next.js data fetching methods that use Apollo Client, the initial state
  // gets hydrated here
  if (initialState) {
    // Get existing cache, loaded during client side data fetching
    const existingCache = localApolloClient.extract();

    const overwriteMerge = (
      target: never,
      source: unknown[],
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      options?: merge.Options,
    ): unknown[] => source;

    // @see https://github.com/wpengine/headless-framework/pull/11#discussion_r533133428
    // Merge the existing cache into data passed from getStaticProps/getServerSideProps
    const data = merge(initialState ?? {}, existingCache, {
      arrayMerge: overwriteMerge,
    });

    // Restore the cache with the merged data
    localApolloClient.cache.restore(data);
  }
  // For SSG and SSR always create a new Apollo Client
  if (isServerSide()) return localApolloClient;
  // Create the Apollo Client once in the client
  // if (!apolloClient) apolloClient = localApolloClient;

  return localApolloClient;
}

/**
 * Merges the Apollo state with the page props passed through the various Next.js Data Fetching
 * functions such as getStaticProps, getServerSideProps, etc.
 *
 * @example
 * ```ts
 * export async function getStaticProps({preview = false}) {
 *     const apolloClient = initializeApollo()
 *
 *     await apolloClient.query({query: YOUR_QUERY})
 *
 *     return addApolloState(apolloClient, {
 *         props: {preview},
 *         revalidate: 1
 *     })
 * }
 * ```
 */
export function addApolloState(
  client: ApolloClient<NormalizedCacheObject>,
  pageProps: GetServerSidePropsResult<unknown> | GetStaticPropsResult<unknown>,
) {
  if ((pageProps as { props: Record<string, any> }).props) {
    // eslint-disable-next-line no-param-reassign
    (pageProps as { props: Record<string, any> }).props[
      APOLLO_STATE_PROP_NAME
    ] = client.cache.extract();
  }

  return pageProps;
}

/**
 * React Hook to use the Apollo client. This is used by <WPGraphQLProvider>
 *
 * @see WPGraphQLProvider
 */
export function useApollo(
  ctx: NextPageContext,
  pageProps: Record<string, any>,
): ApolloClient<NormalizedCacheObject> {
  const state = pageProps[APOLLO_STATE_PROP_NAME];

  return useMemo(() => initializeApollo(ctx, state), [ctx, state]);
}
