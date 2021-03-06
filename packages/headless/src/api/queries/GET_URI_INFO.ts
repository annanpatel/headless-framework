import { gql } from '@apollo/client';

const GET_URI_INFO = gql`
  query GetUriInfo($uri: String!) {
    nodeByUri(uri: $uri) {
      id
      templates
      ... on ContentType {
        isFrontPage
        isPostsPage
      }
    }
  }
`;

export { GET_URI_INFO };
