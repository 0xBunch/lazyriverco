import type { Components } from "react-markdown";

// Shared react-markdown component overrides for user-generated prose
// (library captions, comments, anywhere an uploader's or member's words
// get rendered as markdown). react-markdown v10 already neutralizes
// `javascript:` / `data:` URL schemes in its default urlTransform — this
// adds the two anchor attrs the default doesn't touch:
//
//   - target="_blank"         open member-posted links in a new tab
//   - rel="noopener noreferrer ugc"
//         noopener/noreferrer: standard tabnabbing + referrer hygiene
//         ugc:                 marks links as user-generated content so
//                              search engines don't count them as
//                              editorial endorsements

export const USER_MARKDOWN_COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer ugc" />
  ),
};
