const directory = "catalog-cache";
module.exports = {
  async onPreBuild({ utils }) {
    try {
      await utils.cache.restore(directory);
    } catch {
      console.warn(
        "Catalog cache restore failed; the build still requires a valid published-size catalog.",
      );
    }
  },
  async onPostBuild({ utils }) {
    try {
      await utils.cache.save(directory);
    } catch {
      console.warn(
        "Catalog cache save failed; the validated public snapshot remains part of the deploy.",
      );
    }
  },
};
