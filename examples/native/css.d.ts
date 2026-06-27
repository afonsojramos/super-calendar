// Allow side-effect CSS imports (e.g. `import "./global.css"`). Expo runs these
// through PostCSS/Tailwind on web and treats them as no-ops on native; this just
// tells TypeScript the module exists so the example typechecks.
declare module "*.css";
