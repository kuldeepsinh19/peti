/**
 * Architectural boundaries for Peti. These rules are the executable form of the
 * "Architecture rules" section of CLAUDE.md; CI fails if any of them is broken.
 *
 * Layers inside a module (src/modules/<name>/):
 *   domain/          pure TypeScript — no framework, ORM or I/O
 *   application/     use cases + ports — depends on domain and ports only
 *   infrastructure/  adapters (Prisma, providers) — implements ports
 *   ui/              React components for the module
 *   index.ts         the module's public surface for other modules
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const FRAMEWORK_AND_IO = [
  "^src/generated/",
  "(^|/)node_modules/(next|react|react-dom|@prisma|pg|better-auth|@better-auth|@aws-sdk|razorpay|sharp)(/|$)",
];

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make modules impossible to reason about or extract.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      severity: "error",
      comment: "Domain code must not depend on other layers, frameworks, the ORM or I/O.",
      from: { path: "^src/(modules/[^/]+/domain|shared/domain)/" },
      to: {
        path: [
          "^src/modules/[^/]+/(application|infrastructure|ui)/",
          "^src/shared/(application|infrastructure|ui)/",
          "^src/(app|composition|config)/",
          ...FRAMEWORK_AND_IO,
        ],
      },
    },
    {
      name: "application-depends-on-ports-only",
      severity: "error",
      comment: "Use cases talk to the outside world through ports, never through adapters or the ORM.",
      from: { path: "^src/(modules/[^/]+/application|shared/application)/" },
      to: {
        path: [
          "^src/modules/[^/]+/(infrastructure|ui)/",
          "^src/shared/(infrastructure|ui)/",
          "^src/(app|composition)/",
          ...FRAMEWORK_AND_IO,
        ],
      },
    },
    {
      name: "ui-does-not-touch-infrastructure",
      severity: "error",
      comment: "Components call server actions; they never reach adapters or the ORM.",
      from: { path: "^src/(modules/[^/]+/ui|shared/ui)/" },
      to: {
        path: [
          "^src/modules/[^/]+/infrastructure/",
          "^src/shared/infrastructure/",
          "^src/composition/",
          "^src/generated/",
          "(^|/)node_modules/(@prisma|pg)(/|$)",
        ],
      },
    },
    {
      name: "modules-talk-through-index",
      severity: "error",
      comment: "Another module's internals are private; import its index.ts.",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "shared-does-not-know-modules",
      severity: "error",
      comment: "Shared kernel code must stay independent of feature modules.",
      from: { path: "^src/shared/" },
      to: { path: ["^src/modules/", "^src/composition/", "^src/app/"] },
    },
    {
      name: "routes-do-not-use-the-orm",
      severity: "error",
      comment: "Pages, actions and route handlers go through use cases (via the composition root).",
      from: { path: "^src/app/" },
      to: {
        path: [
          "^src/generated/",
          "(^|/)node_modules/(@prisma|pg)(/|$)",
          "^src/modules/[^/]+/infrastructure/",
        ],
      },
    },
  ],
  options: {
    // Generated Prisma code is recorded as a dependency (so the rules can see it) but not crawled.
    doNotFollow: { path: ["node_modules", "^src/generated/"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
