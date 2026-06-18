const minimumMajor = 24;
const currentVersion = process.versions.node;
const currentMajor = Number.parseInt(currentVersion.split(".")[0] ?? "0", 10);

if (!Number.isFinite(currentMajor) || currentMajor < minimumMajor) {
  console.error("");
  console.error(`EcoFoodStock demande Node.js ${minimumMajor} ou plus.`);
  console.error(`Version active detectee : v${currentVersion}`);
  console.error("");
  console.error("Les dependances du scanner necessitent Node.js 24 ou plus.");
  console.error("Installe Node.js 24 ou plus, redemarre le terminal, puis relance npm run dev.");
  console.error("");
  process.exit(1);
}
