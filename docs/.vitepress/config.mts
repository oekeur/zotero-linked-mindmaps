import { defineConfig } from "vitepress";

const SITE_BASE = "/zotero-linked-mindmaps/";
const SITE_URL = `https://oekeur.github.io${SITE_BASE}`;
const SITE_TITLE = "Zotero Linked Mindmaps";
const SITE_DESCRIPTION =
  "A Zotero 7 plugin for organizing interconnected sources as named mindmaps, with typed, named links between items and notes.";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: SITE_TITLE,
  titleTemplate: ":title | Zotero Linked Mindmaps",
  description: SITE_DESCRIPTION,
  base: SITE_BASE,
  cleanUrls: true,
  lastUpdated: true,

  // The backfill queue is a working document that tracks which docs still need
  // writing. It describes the docs rather than the plugin, so it stays in the
  // repo and off the site.
  srcExclude: ["backfill-queue.md"],

  sitemap: { hostname: SITE_URL },

  head: [
    ["meta", { name: "author", content: "Oscar Keur" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: SITE_TITLE }],
    ["meta", { property: "og:title", content: SITE_TITLE }],
    ["meta", { property: "og:description", content: SITE_DESCRIPTION }],
    ["meta", { property: "og:url", content: SITE_URL }],
  ],

  themeConfig: {
    search: { provider: "local" },

    nav: [
      { text: "User guide", link: "/user-guide/getting-started" },
      { text: "Contributing", link: "/contributing/development-setup" },
      { text: "Internals", link: "/internals/storage-explanation" },
      {
        text: "Repository",
        link: "https://github.com/oekeur/zotero-linked-mindmaps",
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/oekeur/zotero-linked-mindmaps",
      },
    ],

    editLink: {
      pattern:
        "https://github.com/oekeur/zotero-linked-mindmaps/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the AGPL-3.0-or-later license.",
      copyright: "Copyright © Oscar Keur",
    },

    outline: { level: [2, 3] },

    sidebar: {
      "/user-guide/": [
        {
          text: "Start here",
          items: [
            { text: "Getting started", link: "/user-guide/getting-started" },
          ],
        },
        {
          text: "Mindmaps and the graph tab",
          collapsed: false,
          items: [
            {
              text: "Mindmap tab reference",
              link: "/user-guide/mindmap-tab-reference",
            },
            { text: "Using the tab", link: "/user-guide/mindmap-tab-howto" },
            {
              text: "Managing mindmaps",
              link: "/user-guide/mindmaps-manage-howto",
            },
            {
              text: "Node overview dock",
              link: "/user-guide/node-overview-reference",
            },
          ],
        },
        {
          text: "Layout and grouping",
          collapsed: false,
          items: [
            {
              text: "Node layout reference",
              link: "/user-guide/node-layout-reference",
            },
            {
              text: "Why positions persist",
              link: "/user-guide/node-layout-explanation",
            },
            {
              text: "Grouping reference",
              link: "/user-guide/grouping-reference",
            },
            { text: "Grouping nodes", link: "/user-guide/grouping-howto" },
          ],
        },
        {
          text: "Links",
          collapsed: false,
          items: [
            { text: "Adding a link", link: "/user-guide/links-add-howto" },
            {
              text: "Add-link reference",
              link: "/user-guide/links-add-reference",
            },
            {
              text: "Using the Mindmaps section",
              link: "/user-guide/mindmaps-panel-howto",
            },
            {
              text: "Mindmaps section reference",
              link: "/user-guide/mindmaps-panel-reference",
            },
            {
              text: "Adding items from the library",
              link: "/user-guide/library-menu-howto",
            },
            {
              text: "Library right-click reference",
              link: "/user-guide/library-menu-reference",
            },
          ],
        },
        {
          text: "Link types",
          collapsed: false,
          items: [
            {
              text: "Editing link types",
              link: "/user-guide/link-types-howto",
            },
            { text: "Reference", link: "/user-guide/link-types-reference" },
            {
              text: "Why types are editable",
              link: "/user-guide/link-types-explanation",
            },
          ],
        },
        {
          text: "Cross-mindmap links",
          collapsed: false,
          items: [
            {
              text: "Linking across mindmaps",
              link: "/user-guide/cross-mindmap-links-howto",
            },
            {
              text: "Reference",
              link: "/user-guide/cross-mindmap-links-reference",
            },
            {
              text: "Why external nodes exist",
              link: "/user-guide/cross-mindmap-links-explanation",
            },
          ],
        },
        {
          text: "Plugin data in your library",
          collapsed: false,
          items: [
            {
              text: "Recovering trashed plugin data",
              link: "/user-guide/plugin-data-howto",
            },
            {
              text: "What the plugin stores",
              link: "/user-guide/plugin-data-reference",
            },
            {
              text: "Why data lives in a note",
              link: "/user-guide/plugin-data-explanation",
            },
            {
              text: "Hiding plugin data",
              link: "/user-guide/hide-plugin-data-howto",
            },
            {
              text: "Hiding plugin data reference",
              link: "/user-guide/hide-plugin-data-reference",
            },
          ],
        },
      ],

      "/contributing/": [
        {
          text: "Contributing",
          items: [
            {
              text: "Development setup",
              link: "/contributing/development-setup",
            },
            {
              text: "npm scripts",
              link: "/contributing/npm-scripts-reference",
            },
            { text: "Running tests", link: "/contributing/testing-howto" },
            {
              text: "Why tests run against live Zotero",
              link: "/contributing/testing-explanation",
            },
            {
              text: "Configuration",
              link: "/contributing/configuration-reference",
            },
            {
              text: "Cutting a release",
              link: "/contributing/releasing-howto",
            },
          ],
        },
      ],

      "/internals/": [
        {
          text: "Storage and data model",
          collapsed: false,
          items: [
            { text: "Storage design", link: "/internals/storage-explanation" },
            { text: "Storage reference", link: "/internals/storage-reference" },
            { text: "Schema design", link: "/internals/schema-explanation" },
            { text: "Schema reference", link: "/internals/schema-reference" },
            {
              text: "Why stored JSON is untrusted",
              link: "/internals/validate-explanation",
            },
            {
              text: "Validation reference",
              link: "/internals/validate-reference",
            },
            {
              text: "Mutations reference",
              link: "/internals/mutations-reference",
            },
          ],
        },
        {
          text: "Cleanup and reconciliation",
          collapsed: false,
          items: [
            {
              text: "Container guard design",
              link: "/internals/container-guard-explanation",
            },
            {
              text: "Container guard reference",
              link: "/internals/container-guard-reference",
            },
            {
              text: "Deletion cleanup design",
              link: "/internals/deletion-cleanup-explanation",
            },
            {
              text: "Deletion cleanup reference",
              link: "/internals/deletion-cleanup-reference",
            },
            {
              text: "Cross-mindmap cleanup design",
              link: "/internals/cross-mindmap-cleanup-explanation",
            },
            {
              text: "Cross-mindmap cleanup reference",
              link: "/internals/cross-mindmap-cleanup-reference",
            },
          ],
        },
        {
          text: "Rendering",
          collapsed: false,
          items: [
            {
              text: "Rendering design",
              link: "/internals/rendering-explanation",
            },
            {
              text: "Rendering reference",
              link: "/internals/rendering-reference",
            },
            { text: "Layout reference", link: "/internals/layout-reference" },
            {
              text: "Node labels reference",
              link: "/internals/node-labels-reference",
            },
            {
              text: "UI element helpers",
              link: "/internals/ui-elements-reference",
            },
            {
              text: "Cytoscape inside Zotero",
              link: "/internals/cytoscape-explanation",
            },
          ],
        },
        {
          text: "Lifecycle and Zotero integration",
          collapsed: false,
          items: [
            {
              text: "Lifecycle design",
              link: "/internals/lifecycle-explanation",
            },
            {
              text: "Lifecycle reference",
              link: "/internals/lifecycle-reference",
            },
            {
              text: "Notifiers and the storage queue",
              link: "/internals/notifier-queue-explanation",
            },
            {
              text: "Library filter design",
              link: "/internals/library-filter-explanation",
            },
            {
              text: "Library filter reference",
              link: "/internals/library-filter-reference",
            },
            {
              text: "Polyfills reference",
              link: "/internals/polyfills-reference",
            },
            { text: "Locale reference", link: "/internals/locale-reference" },
            {
              text: "Preferences reference",
              link: "/internals/prefs-reference",
            },
          ],
        },
      ],
    },
  },
});
