// Netlify ignore commands exit 0 to SKIP, 1 to continue a production build.
process.exit(process.env.BRANCH === "preview" ? 0 : 1);
